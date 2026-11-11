// Behaviour of createContent (P1-02, P1-03). Acceptance checks from
// docs/07-build-sequence.md: a dangling `item_ids` entry fails validation with
// the id in the report; an install writes units, lessons, exercises and items
// and one `active` version row. Everything here runs in memory.
import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '@stufen/contracts';
import type { CurriculumSnapshot, SnapshotWriter } from '@stufen/contracts';
import {
  buildSnapshot,
  createContent,
  createInMemoryContentStore,
  PackInvalidError,
  PackNotRegisteredError,
} from '../src/index';
import type { ContentStore } from '../src/index';
import { loadGermanPackFromDisk, makePack } from './helpers/pack';

const NOW = '2026-11-11T12:00:00.000Z';

/** A writer that keeps every snapshot it is given, or throws when told to. */
function makeWriter() {
  const written: CurriculumSnapshot[] = [];
  let failure: Error | null = null;
  const writer: SnapshotWriter = {
    async replaceLanguage(snapshot) {
      if (failure) throw failure;
      written.push(structuredClone(snapshot));
    },
  };
  return {
    writer,
    written,
    failWith(error: Error | null) {
      failure = error;
    },
  };
}

/** One service wired to a fresh store, writer stub and bus, with a clock the test controls. */
function setup(override: { store?: ContentStore } = {}) {
  const store = override.store ?? createInMemoryContentStore();
  const { writer, written, failWith } = makeWriter();
  const bus = createEventBus();
  const installed = vi.fn(async () => {});
  bus.on('content.pack_installed', installed);
  let time = Date.parse(NOW);
  const content = createContent({ store, writer, bus, now: () => new Date(time) });
  return {
    store,
    written,
    failWith,
    installed,
    content,
    /** Moves the injected clock forward. */
    advance(ms: number) {
      time += ms;
    },
  };
}

describe('registerPack, validatePack, buildSnapshot', () => {
  it('validatePack reports on the registered pack', async () => {
    const { content } = setup();
    content.registerPack(makePack());

    expect(await content.validatePack('nl')).toEqual({
      language: 'nl',
      version: '0.1.0',
      ok: true,
      errors: [],
      warnings: [],
    });
  });

  it('acceptance: a dangling item_ids entry fails validation with the id in the report', async () => {
    const { content, written, store } = setup();
    content.registerPack(
      makePack((data) => {
        data.units[0]?.lessons[0]?.exercises[0]?.item_ids.push('nl:vocab:gibt-es-nicht');
      }),
    );

    const report = await content.validatePack('nl');

    expect(report.ok).toBe(false);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]?.message).toContain('nl:vocab:gibt-es-nicht');
    // validatePack writes nothing.
    expect(written).toEqual([]);
    expect(await store.listVersions('nl')).toEqual([]);
  });

  it('an unknown language throws PackNotRegisteredError from every method that needs a pack', async () => {
    const { content } = setup();
    content.registerPack(makePack());

    for (const call of [
      () => content.validatePack('fr'),
      () => content.buildSnapshot('fr'),
      () => content.installPack('fr'),
    ]) {
      const attempt = call();
      await expect(attempt).rejects.toBeInstanceOf(PackNotRegisteredError);
      await expect(attempt).rejects.toMatchObject({
        name: 'PackNotRegisteredError',
        language: 'fr',
      });
    }
    expect(await content.activePackVersion('fr')).toBeNull();
  });

  it('registering the same language twice replaces the registration', async () => {
    const { content } = setup();
    content.registerPack(makePack());
    content.registerPack(
      makePack((data) => {
        data.manifest.version = '0.2.0';
      }),
    );

    expect((await content.validatePack('nl')).version).toBe('0.2.0');
    expect((await content.buildSnapshot('nl')).version).toBe('0.2.0');
  });

  it('buildSnapshot gives the snapshot of the registered pack, the same every time', async () => {
    const { content, written } = setup();
    const pack = makePack();
    content.registerPack(pack);

    const snapshot = await content.buildSnapshot('nl');

    expect(snapshot).toEqual(buildSnapshot(pack));
    expect(await content.buildSnapshot('nl')).toEqual(snapshot);
    expect(written).toEqual([]);
  });

  it('two services do not share registrations', async () => {
    const one = setup();
    const two = setup();
    one.content.registerPack(makePack());

    await expect(two.content.validatePack('nl')).rejects.toBeInstanceOf(PackNotRegisteredError);
  });
});

describe('installPack', () => {
  it('acceptance: writes the snapshot, records one active version, emits once, returns counts', async () => {
    const { content, written, store, installed } = setup();
    const pack = makePack();
    content.registerPack(pack);

    const report = await content.installPack('nl');

    expect(report).toEqual({
      language: 'nl',
      version: '0.1.0',
      status: 'active',
      candos: 3,
      items: 4,
      units: 2,
      lessons: 3,
      exercises: 4,
    });
    // The writer got exactly the snapshot of the pack: units, lessons, exercises, items.
    expect(written).toEqual([buildSnapshot(pack)]);
    expect(await store.listVersions('nl')).toEqual([
      {
        language: 'nl',
        version: '0.1.0',
        checksum: 'sha256:fixture',
        status: 'active',
        installedAt: NOW,
      },
    ]);
    expect(await content.activePackVersion('nl')).toBe('0.1.0');
    expect(installed).toHaveBeenCalledTimes(1);
    expect(installed).toHaveBeenCalledWith({ language: 'nl', version: '0.1.0' });
  });

  it('a pack with warnings only still installs', async () => {
    const { content, written } = setup();
    content.registerPack(
      makePack((data) => {
        data.manifest.checksum = 'pending';
      }),
    );

    const report = await content.installPack('nl');

    expect(report.status).toBe('active');
    expect(written).toHaveLength(1);
  });

  it('refuses an invalid pack with the report, and writes nothing', async () => {
    const { content, written, store, installed } = setup();
    content.registerPack(
      makePack((data) => {
        data.units[0]?.lessons[0]?.exercises[0]?.item_ids.push('nl:vocab:gibt-es-nicht');
      }),
    );

    const attempt = content.installPack('nl');

    await expect(attempt).rejects.toBeInstanceOf(PackInvalidError);
    const error = await attempt.catch((caught: unknown) => caught);
    if (!(error instanceof PackInvalidError)) throw new Error('expected PackInvalidError');
    expect(error.name).toBe('PackInvalidError');
    expect(error.report.ok).toBe(false);
    expect(error.report.errors).toHaveLength(1);
    expect(error.report.errors[0]?.message).toContain('nl:vocab:gibt-es-nicht');
    expect(error.message).toContain('nl:vocab:gibt-es-nicht');
    expect(written).toEqual([]);
    expect(await store.listVersions('nl')).toEqual([]);
    expect(await content.activePackVersion('nl')).toBeNull();
    expect(installed).not.toHaveBeenCalled();
  });

  it('refuses a pack whose lesson introduces an item that does not exist', async () => {
    const { content, written, store } = setup();
    content.registerPack(
      makePack((data) => {
        const lesson = data.units[0]?.lessons[0];
        if (lesson) lesson.introduces_item_ids = ['nl:vocab:hallo', 'nl:vocab:spook'];
      }),
    );

    const error = await content.installPack('nl').catch((caught: unknown) => caught);

    if (!(error instanceof PackInvalidError)) throw new Error('expected PackInvalidError');
    expect(error.report.errors).toEqual([
      expect.objectContaining({
        severity: 'error',
        path: 'units[nl:unit:a1-01-hallo].lessons[nl:lesson:a1-01-02].introduces_item_ids[1]',
        message: 'item nl:vocab:spook does not exist in the pack',
      }),
    ]);
    expect(written).toEqual([]);
    expect(await store.listVersions('nl')).toEqual([]);
  });

  it('hands the writer the instructions, English titles and introduced items', async () => {
    const { content, written } = setup();
    content.registerPack(
      makePack((data) => {
        const lesson = data.units[1]?.lessons[0];
        const exercise = lesson?.exercises[0];
        if (!lesson || !exercise) throw new Error('fixture');
        lesson.introduces_item_ids = ['nl:vocab:ja'];
        exercise.instruction_en = 'Turn the card.';
      }),
    );

    await content.installPack('nl');

    const unit = written[0]?.units[1];
    expect(unit?.titleEn).toBe('Family');
    expect(unit?.lessons[0]).toMatchObject({
      titleEn: 'Lesson 1',
      description: null,
      introducesItemIds: [written[0]?.items[2]?.id],
    });
    expect(unit?.lessons[0]?.exercises[0]).toMatchObject({
      instructionEn: 'Turn the card.',
      instructionNative: null,
    });
  });

  it('records the version as failed and rethrows when the writer throws', async () => {
    const { content, written, store, installed, failWith } = setup();
    const boom = new Error('curriculum tables are locked');
    content.registerPack(makePack());
    failWith(boom);

    await expect(content.installPack('nl')).rejects.toBe(boom);

    expect(written).toEqual([]);
    expect(await store.listVersions('nl')).toEqual([
      {
        language: 'nl',
        version: '0.1.0',
        checksum: 'sha256:fixture',
        status: 'failed',
        installedAt: NOW,
      },
    ]);
    expect(await content.activePackVersion('nl')).toBeNull();
    expect(installed).not.toHaveBeenCalled();
  });

  it('a failed install can be run again and then becomes active', async () => {
    const { content, store, installed, failWith, advance } = setup();
    content.registerPack(makePack());
    failWith(new Error('first try'));
    await expect(content.installPack('nl')).rejects.toThrow('first try');

    failWith(null);
    advance(60_000);
    await content.installPack('nl');

    expect((await store.listVersions('nl')).map((row) => [row.version, row.status])).toEqual([
      ['0.1.0', 'active'],
    ]);
    expect(installed).toHaveBeenCalledTimes(1);
  });
});

describe('installPack across versions', () => {
  const version = (value: string) =>
    makePack((data) => {
      data.manifest.version = value;
      data.manifest.checksum = `sha256:${value}`;
    });

  it('a second version supersedes the first', async () => {
    const { content, store, installed, advance } = setup();
    content.registerPack(version('0.1.0'));
    await content.installPack('nl');

    content.registerPack(version('0.2.0'));
    advance(60_000);
    await content.installPack('nl');

    expect(await content.activePackVersion('nl')).toBe('0.2.0');
    expect(
      (await store.listVersions('nl')).map((row) => [row.version, row.status, row.checksum]),
    ).toEqual([
      ['0.2.0', 'active', 'sha256:0.2.0'],
      ['0.1.0', 'superseded', 'sha256:0.1.0'],
    ]);
    expect(installed).toHaveBeenCalledTimes(2);
    expect(installed).toHaveBeenLastCalledWith({ language: 'nl', version: '0.2.0' });
  });

  it('installing the same pack twice writes the same ids and keeps one version row', async () => {
    const { content, written, store, advance } = setup();
    content.registerPack(makePack());

    await content.installPack('nl');
    advance(60_000);
    await content.installPack('nl');

    expect(written).toHaveLength(2);
    expect(written[1]).toEqual(written[0]);
    expect(await store.listVersions('nl')).toEqual([
      expect.objectContaining({
        version: '0.1.0',
        status: 'active',
        installedAt: '2026-11-11T12:01:00.000Z',
      }),
    ]);
  });

  it('a new version whose write fails is recorded as failed and the old one stays active', async () => {
    const { content, store, installed, failWith, advance } = setup();
    content.registerPack(version('0.1.0'));
    await content.installPack('nl');

    content.registerPack(version('0.2.0'));
    failWith(new Error('disk full'));
    advance(60_000);
    await expect(content.installPack('nl')).rejects.toThrow('disk full');

    expect(await content.activePackVersion('nl')).toBe('0.1.0');
    expect((await store.listVersions('nl')).map((row) => [row.version, row.status])).toEqual([
      ['0.2.0', 'failed'],
      ['0.1.0', 'active'],
    ]);
    expect(installed).toHaveBeenCalledTimes(1);
  });

  it('a failed reinstall of the active version leaves its row active', async () => {
    const { content, store, failWith, advance } = setup();
    content.registerPack(makePack());
    await content.installPack('nl');

    failWith(new Error('disk full'));
    advance(60_000);
    await expect(content.installPack('nl')).rejects.toThrow('disk full');

    // The writer replaces a language in one step, so the earlier content is still there.
    expect(await store.listVersions('nl')).toEqual([
      expect.objectContaining({ version: '0.1.0', status: 'active', installedAt: NOW }),
    ]);
  });

  it("the writer's error is rethrown even when the failure cannot be recorded", async () => {
    const inner = createInMemoryContentStore();
    const store: ContentStore = {
      ...inner,
      recordVersion: async () => {
        throw new Error('version table is gone');
      },
    };
    const { content, failWith } = setup({ store });
    const boom = new Error('curriculum tables are locked');
    content.registerPack(makePack());
    failWith(boom);

    await expect(content.installPack('nl')).rejects.toBe(boom);
  });

  it('languages are installed independently', async () => {
    const { content, written, store } = setup();
    content.registerPack(makePack());
    const german = loadGermanPackFromDisk();
    content.registerPack(german);

    const dutch = await content.installPack('nl');
    const report = await content.installPack('de');

    // The real pack keeps growing, so its counts are read from its own snapshot.
    const snapshot = buildSnapshot(german);
    const lessons = snapshot.units.flatMap((unit) => unit.lessons);
    expect(report).toEqual({
      language: 'de',
      version: german.version,
      status: 'active',
      candos: snapshot.candos.length,
      items: snapshot.items.length,
      units: snapshot.units.length,
      lessons: lessons.length,
      exercises: lessons.flatMap((lesson) => lesson.exercises).length,
    });
    expect(written.map((entry) => entry.language)).toEqual(['nl', 'de']);
    expect(written[1]).toEqual(snapshot);
    expect(await content.activePackVersion('nl')).toBe(dutch.version);
    expect(await content.activePackVersion('de')).toBe(german.version);
    expect((await store.activeVersion('de'))?.checksum).toBe(german.loadManifest().checksum);
  });
});
