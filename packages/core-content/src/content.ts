// The core-content service (P1-02, P1-03). Language packs are registered at
// runtime by the composition root; this box knows the LanguagePack interface
// and never a pack's contents. Everything it needs comes in through the
// factory: the version store, the writer that holds the curriculum tables,
// the event bus and a clock. No module level state.
import type {
  CurriculumSnapshot,
  EventBus,
  InstallReport,
  LanguageCode,
  LanguagePack,
  SnapshotWriter,
} from '@stufen/contracts';
import { buildSnapshot } from './snapshot';
import type { ContentStore } from './store';
import { validatePackData } from './validate';
import type { PackValidationReport } from './validate';

/** Thrown when a language is asked for that no pack was registered for. */
export class PackNotRegisteredError extends Error {
  readonly language: string;

  constructor(language: string) {
    super(`no language pack is registered for "${language}"`);
    this.name = 'PackNotRegisteredError';
    this.language = language;
  }
}

/** Thrown by installPack when validation found at least one error. Carries the full report. */
export class PackInvalidError extends Error {
  readonly report: PackValidationReport;

  constructor(report: PackValidationReport) {
    const [first] = report.errors;
    const example = first ? `, first: ${first.path} ${first.message}` : '';
    super(
      `pack ${report.language} ${report.version} is not valid: ${report.errors.length} error(s)${example}`,
    );
    this.name = 'PackInvalidError';
    this.report = report;
  }
}

export interface ContentDeps {
  store: ContentStore;
  /** Where an installed pack is written: the curriculum store. */
  writer: SnapshotWriter;
  bus: EventBus;
  /** Clock for installedAt. Defaults to the system clock. */
  now?: () => Date;
}

export interface Content {
  /** Makes a pack known. Registering the same language again replaces the earlier pack. */
  registerPack(pack: LanguagePack): void;
  /** Referential checks, no writes. Throws PackNotRegisteredError. */
  validatePack(language: LanguageCode): Promise<PackValidationReport>;
  /** The snapshot installPack would write. Throws PackNotRegisteredError. */
  buildSnapshot(language: LanguageCode): Promise<CurriculumSnapshot>;
  /**
   * Validates, builds, writes through the writer, records the version as
   * active and emits content.pack_installed. Throws PackNotRegisteredError,
   * PackInvalidError (nothing is written), or whatever the writer threw (the
   * version is then recorded as failed).
   */
  installPack(language: LanguageCode): Promise<InstallReport>;
  /** The version string of the active pack, or null when none is installed. */
  activePackVersion(language: LanguageCode): Promise<string | null>;
}

function countOf(
  snapshot: CurriculumSnapshot,
): Omit<InstallReport, 'language' | 'version' | 'status'> {
  const lessons = snapshot.units.flatMap((unit) => unit.lessons);
  return {
    candos: snapshot.candos.length,
    items: snapshot.items.length,
    units: snapshot.units.length,
    lessons: lessons.length,
    exercises: lessons.reduce((sum, lesson) => sum + lesson.exercises.length, 0),
  };
}

export function createContent(deps: ContentDeps): Content {
  const { store, writer, bus } = deps;
  const now = deps.now ?? (() => new Date());
  const packs = new Map<LanguageCode, LanguagePack>();

  function packFor(language: LanguageCode): LanguagePack {
    const pack = packs.get(language);
    if (!pack) throw new PackNotRegisteredError(language);
    return pack;
  }

  /**
   * Notes a failed install. The row of the version that is active right now is
   * left alone: the writer replaces a language in one step, so after a failed
   * reinstall of that same version its earlier content is still what readers
   * see. A failure to write the note never hides the writer's own error.
   */
  async function recordFailure(pack: LanguagePack, checksum: string): Promise<void> {
    try {
      const active = await store.activeVersion(pack.code);
      if (active?.version === pack.version) return;
      await store.recordVersion({
        language: pack.code,
        version: pack.version,
        checksum,
        status: 'failed',
        installedAt: now().toISOString(),
      });
    } catch {
      // The caller rethrows the writer's error, which is the one that matters.
    }
  }

  return {
    registerPack(pack: LanguagePack): void {
      packs.set(pack.code, pack);
    },

    async validatePack(language: LanguageCode): Promise<PackValidationReport> {
      return validatePackData(packFor(language));
    },

    async buildSnapshot(language: LanguageCode): Promise<CurriculumSnapshot> {
      return buildSnapshot(packFor(language));
    },

    async installPack(language: LanguageCode): Promise<InstallReport> {
      const pack = packFor(language);
      const report = validatePackData(pack);
      if (!report.ok) throw new PackInvalidError(report);

      const snapshot = buildSnapshot(pack);
      const checksum = pack.loadManifest().checksum;
      try {
        await writer.replaceLanguage(snapshot);
      } catch (error) {
        await recordFailure(pack, checksum);
        throw error;
      }

      await store.recordVersion({
        language: pack.code,
        version: pack.version,
        checksum,
        status: 'active',
        installedAt: now().toISOString(),
      });
      await bus.emit('content.pack_installed', { language: pack.code, version: pack.version });
      return { language: pack.code, version: pack.version, status: 'active', ...countOf(snapshot) };
    },

    async activePackVersion(language: LanguageCode): Promise<string | null> {
      return (await store.activeVersion(language))?.version ?? null;
    },
  };
}
