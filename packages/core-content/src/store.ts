// Storage port for core-content and its in memory adapter (P1-03). The port
// lists the reads and writes this box needs from the `content_pack_versions`
// table in docs/03-data-schema.md: one row per language and pack version. The
// Postgres adapter in postgres-store.ts implements the same interface.
import type { LanguageCode } from '@stufen/contracts';

/** The values of content_pack_versions.status. */
export type PackVersionStatus = 'installing' | 'active' | 'superseded' | 'failed';

/** One row: a version of a language's pack and what became of its install. */
export interface PackVersionRecord {
  language: LanguageCode;
  version: string;
  /** The manifest checksum at install time, `sha256:<hex>` or `pending`. */
  checksum: string;
  status: PackVersionStatus;
  /** ISO timestamp of the last time this version was recorded. */
  installedAt: string;
}

export interface RecordVersionInput {
  language: LanguageCode;
  version: string;
  checksum: string;
  status: PackVersionStatus;
  /** ISO timestamp. Defaults to the adapter's clock. */
  installedAt?: string;
}

/**
 * Rules every adapter keeps:
 *   - One row per (language, version). Recording the same pair again replaces
 *     checksum, status and installedAt of that row.
 *   - A language has at most one `active` row. Recording a version as `active`
 *     turns every other `active` row of that language into `superseded`.
 *     Recording any other status leaves the other rows alone.
 *   - Languages do not affect each other.
 *   - listVersions is newest first by installedAt. Rows with the same
 *     installedAt come back in a stable order that is up to the adapter.
 */
export interface ContentStore {
  /** Writes one row and applies the supersede rule. Resolves to the row as stored. */
  recordVersion(input: RecordVersionInput): Promise<PackVersionRecord>;
  /** The `active` row of the language, or null when nothing is installed. */
  activeVersion(language: LanguageCode): Promise<PackVersionRecord | null>;
  /** Every row of the language, newest first. */
  listVersions(language: LanguageCode): Promise<PackVersionRecord[]>;
}

/**
 * Keeps rows in an array for unit tests and local runs. Rows are copied on the
 * way in and on the way out, so callers cannot change stored data by mutating
 * what they hold. Rows with the same installedAt list the later write first.
 */
export function createInMemoryContentStore(): ContentStore {
  // Write order. A row that is recorded again moves to the end.
  let rows: PackVersionRecord[] = [];

  return {
    async recordVersion(input: RecordVersionInput): Promise<PackVersionRecord> {
      const row: PackVersionRecord = {
        language: input.language,
        version: input.version,
        checksum: input.checksum,
        status: input.status,
        installedAt: new Date(input.installedAt ?? Date.now()).toISOString(),
      };
      rows = rows.filter(
        (other) => !(other.language === row.language && other.version === row.version),
      );
      if (row.status === 'active') {
        for (const other of rows) {
          if (other.language === row.language && other.status === 'active') {
            other.status = 'superseded';
          }
        }
      }
      rows.push(row);
      return { ...row };
    },

    async activeVersion(language: LanguageCode): Promise<PackVersionRecord | null> {
      const row = rows.find((other) => other.language === language && other.status === 'active');
      return row ? { ...row } : null;
    },

    async listVersions(language: LanguageCode): Promise<PackVersionRecord[]> {
      return rows
        .map((row, index) => ({ row, index, time: Date.parse(row.installedAt) }))
        .filter((entry) => entry.row.language === language)
        .sort((a, b) => b.time - a.time || b.index - a.index)
        .map((entry) => ({ ...entry.row }));
    },
  };
}
