// Integration test for the Postgres adapter (P1-28). Needs a real PostgreSQL
// with the migrations applied and is skipped when DATABASE_URL is not set.
// See "How to test it" in the README.
//
//   DATABASE_URL=postgres://stufen@localhost:5497/stufen_content pnpm --filter @stufen/core-content test
//
// It writes version rows for the languages 'nl' and 'fr' only, with version
// strings no other run uses, and deletes exactly those rows after every test.
// German rows are never touched.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createEventBus } from '@stufen/contracts';
import type { CurriculumSnapshot, LanguageCode, SnapshotWriter } from '@stufen/contracts';
import { createDb, withUser } from '@stufen/db';
import type { Database } from '@stufen/db';
import { buildSnapshot, createContent, createPostgresContentStore } from '../src/index';
import type { ContentStore, RecordVersionInput } from '../src/index';
import { makePack } from './helpers/pack';
import { runContentStoreContract, uniqueVersion } from './store-contract';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('createPostgresContentStore on a real Postgres', () => {
  let db: Database;
  const written: { language: string; version: string }[] = [];

  beforeAll(() => {
    db = createDb(url as string);
  });

  afterEach(async () => {
    for (const { language, version } of written.splice(0)) {
      await db
        .deleteFrom('content_pack_versions')
        .where('language_code', '=', language)
        .where('version', '=', version)
        .execute();
    }
  });

  afterAll(async () => {
    await db.destroy();
  });

  /** The store under test. Notes every row it is asked to write, for afterEach. */
  function makeStore(): ContentStore {
    const store = createPostgresContentStore(db);
    return {
      ...store,
      recordVersion(input: RecordVersionInput) {
        written.push({ language: input.language, version: input.version });
        return store.recordVersion(input);
      },
    };
  }

  /** The row as the owner sees it, straight from the table. */
  const rawRow = (language: string, version: string) =>
    db
      .selectFrom('content_pack_versions')
      .selectAll()
      .where('language_code', '=', language)
      .where('version', '=', version)
      .executeTakeFirst();

  runContentStoreContract('Postgres', makeStore, ['nl', 'fr']);

  describe('what is specific to the Postgres adapter', () => {
    it('writes one row with the columns of content_pack_versions', async () => {
      const store = makeStore();
      const version = uniqueVersion();

      await store.recordVersion({
        language: 'nl',
        version,
        checksum: 'sha256:abcd',
        status: 'active',
        installedAt: '2026-11-11T08:30:00.000Z',
      });

      const row = await rawRow('nl', version);
      expect(row).toMatchObject({
        language_code: 'nl',
        version,
        checksum: 'sha256:abcd',
        status: 'active',
      });
      expect(row?.installed_at.toISOString()).toBe('2026-11-11T08:30:00.000Z');
    });

    it('rows with the same installedAt come back in descending version order', async () => {
      const store = makeStore();
      const installedAt = '2026-11-11T10:00:00.000Z';
      const versions = [uniqueVersion('1.0.0'), uniqueVersion('3.0.0'), uniqueVersion('2.0.0')];
      for (const version of versions) {
        await store.recordVersion({
          language: 'fr',
          version,
          checksum: 'c',
          status: 'failed',
          installedAt,
        });
      }

      const listed = await store.listVersions('fr');

      expect(listed.map((row) => row.version)).toEqual([...versions].sort().reverse());
    });

    it('rejects a language that is not in the languages table', async () => {
      const store = createPostgresContentStore(db);
      const version = uniqueVersion();

      const attempt = store.recordVersion({
        language: 'xx' as LanguageCode,
        version,
        checksum: 'c',
        status: 'active',
      });

      // 23503 foreign_key_violation: language_code references languages(code).
      await expect(attempt).rejects.toMatchObject({ code: '23503' });
      expect(await rawRow('xx', version)).toBeUndefined();
    });

    it('two stores on separate connections never leave two active rows', async () => {
      const one = makeStore();
      const two = makeStore();
      const versions = Array.from({ length: 6 }, () => uniqueVersion());

      // Six installs of one language at once, three per store.
      const results = await Promise.allSettled(
        versions.map((version, index) =>
          (index % 2 === 0 ? one : two).recordVersion({
            language: 'fr',
            version,
            checksum: 'c',
            status: 'active',
          }),
        ),
      );

      expect(results.map((result) => result.status)).toEqual(versions.map(() => 'fulfilled'));
      const rows = await db
        .selectFrom('content_pack_versions')
        .select(['version', 'status'])
        .where('language_code', '=', 'fr')
        .execute();
      expect(rows).toHaveLength(versions.length);
      expect(rows.filter((row) => row.status === 'active')).toHaveLength(1);
      expect(rows.filter((row) => row.status === 'superseded')).toHaveLength(versions.length - 1);
    });

    it('retries once when a writer outside the adapter made another version active meanwhile', async () => {
      const store = makeStore();
      const outside = uniqueVersion('0.1.0');
      const mine = uniqueVersion('0.2.0');
      written.push({ language: 'nl', version: outside });
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let inserted: () => void = () => {};
      const outsideInserted = new Promise<void>((resolve) => {
        inserted = resolve;
      });

      // A plain insert that does not take the language lock and stays open.
      const outsideWrite = db.transaction().execute(async (trx) => {
        await trx
          .insertInto('content_pack_versions')
          .values({ language_code: 'nl', version: outside, checksum: 'c', status: 'active' })
          .execute();
        inserted();
        await gate;
      });
      await outsideInserted;

      // Blocks on the one active index until the other transaction commits,
      // then fails with 23505 and tries again.
      const recording = store.recordVersion({
        language: 'nl',
        version: mine,
        checksum: 'c',
        status: 'active',
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      release();
      await outsideWrite;

      await expect(recording).resolves.toMatchObject({ version: mine, status: 'active' });
      expect(await rawRow('nl', outside)).toMatchObject({ status: 'superseded' });
      expect(await rawRow('nl', mine)).toMatchObject({ status: 'active' });
    });

    it('the restricted role reads every row but cannot write', async () => {
      const store = makeStore();
      const version = uniqueVersion();
      await store.recordVersion({ language: 'nl', version, checksum: 'c', status: 'active' });

      // Nobody signed in: the policy content_pack_versions_read still shows the row.
      const seen = await withUser(db, null, (trx) =>
        trx
          .selectFrom('content_pack_versions')
          .select(['version', 'status'])
          .where('version', '=', version)
          .execute(),
      );
      expect(seen).toEqual([{ version, status: 'active' }]);

      const forged = uniqueVersion();
      written.push({ language: 'nl', version: forged });
      const insert = withUser(db, null, (trx) =>
        trx
          .insertInto('content_pack_versions')
          .values({ language_code: 'nl', version: forged, checksum: 'c', status: 'active' })
          .execute(),
      );
      // 42501 insufficient_privilege: stufen_app may only read this table.
      await expect(insert).rejects.toMatchObject({ code: '42501' });

      // Since migration 0006 the role has no write grant at all on this table,
      // so an update or a delete is refused outright instead of matching no row.
      const update = withUser(db, null, (trx) =>
        trx
          .updateTable('content_pack_versions')
          .set({ status: 'failed' })
          .where('version', '=', version)
          .execute(),
      );
      await expect(update).rejects.toMatchObject({ code: '42501' });
      const remove = withUser(db, null, (trx) =>
        trx.deleteFrom('content_pack_versions').where('version', '=', version).execute(),
      );
      await expect(remove).rejects.toMatchObject({ code: '42501' });
      expect(await rawRow('nl', version)).toMatchObject({ status: 'active' });
      expect(await rawRow('nl', forged)).toBeUndefined();
    });
  });

  describe('the createContent facade on the Postgres store', () => {
    function setup() {
      const snapshots: CurriculumSnapshot[] = [];
      const writer: SnapshotWriter = {
        async replaceLanguage(snapshot) {
          snapshots.push(structuredClone(snapshot));
        },
      };
      const bus = createEventBus();
      const installed = vi.fn(async () => {});
      bus.on('content.pack_installed', installed);
      let time = Date.parse('2026-11-11T15:00:00.000Z');
      const content = createContent({
        store: makeStore(),
        writer,
        bus,
        // One minute later on every call, so the order is known.
        now: () => new Date((time += 60_000)),
      });
      return { content, snapshots, installed };
    }

    const packAt = (version: string) =>
      makePack((data) => {
        data.manifest.version = version;
        data.manifest.checksum = `sha256:${version}`;
      });

    it('acceptance: installPack writes one active row, and a second install supersedes the first', async () => {
      const { content, snapshots, installed } = setup();
      const v1 = uniqueVersion('0.1.0');
      const v2 = uniqueVersion('0.2.0');
      const first = packAt(v1);
      content.registerPack(first);

      const report = await content.installPack('nl');

      expect(report).toMatchObject({ language: 'nl', version: v1, status: 'active', exercises: 4 });
      expect(snapshots).toEqual([buildSnapshot(first)]);
      expect(await rawRow('nl', v1)).toMatchObject({ checksum: `sha256:${v1}`, status: 'active' });
      expect(await content.activePackVersion('nl')).toBe(v1);

      content.registerPack(packAt(v2));
      await content.installPack('nl');

      expect(await content.activePackVersion('nl')).toBe(v2);
      expect(await rawRow('nl', v1)).toMatchObject({ status: 'superseded' });
      expect(await rawRow('nl', v2)).toMatchObject({ checksum: `sha256:${v2}`, status: 'active' });
      expect(installed).toHaveBeenCalledTimes(2);
      expect(installed).toHaveBeenLastCalledWith({ language: 'nl', version: v2 });
    });

    it('a writer failure is recorded as failed and does not touch the active row', async () => {
      const v1 = uniqueVersion('0.1.0');
      const v2 = uniqueVersion('0.2.0');
      const store = makeStore();
      const boom = new Error('curriculum tables are locked');
      let fail = false;
      const content = createContent({
        store,
        writer: {
          async replaceLanguage() {
            if (fail) throw boom;
          },
        },
        bus: createEventBus(),
      });
      content.registerPack(packAt(v1));
      await content.installPack('nl');

      fail = true;
      content.registerPack(packAt(v2));
      await expect(content.installPack('nl')).rejects.toBe(boom);

      expect(await rawRow('nl', v1)).toMatchObject({ status: 'active' });
      expect(await rawRow('nl', v2)).toMatchObject({ status: 'failed', checksum: `sha256:${v2}` });
      expect(await content.activePackVersion('nl')).toBe(v1);
    });
  });
});
