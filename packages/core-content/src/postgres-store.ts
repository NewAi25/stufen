// Postgres adapter for the ContentStore port (P1-28). Reads and writes the
// `content_pack_versions` table from packages/db/migrations/0001_init.sql.
//
// Access model:
//   recordVersion  owner work, the way a pack install runs: `db` directly, in
//                  one transaction, so the supersede rule and the new row land
//                  together or not at all. stufen_app has no write grant here
//                  (migration 0006). The transaction locks the language's row
//                  in `languages` first, so two installs of one language run
//                  one after the other and never leave two active rows.
//   activeVersion, listVersions  inside withUser(db, null, ...), as the
//                  restricted role stufen_app with nobody signed in. The table
//                  is reference data: its policy lets everyone read every row.
import type { LanguageCode } from '@stufen/contracts';
import { withUser } from '@stufen/db';
import type { Database, Row } from '@stufen/db';
import type { ContentStore, PackVersionRecord, RecordVersionInput } from './store';

type VersionRow = Row<'content_pack_versions'>;

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

/** Row to record. `installed_at` is a Date from the driver, handed out as an ISO string. */
function toRecord(language: LanguageCode, row: VersionRow): PackVersionRecord {
  return {
    language,
    version: row.version,
    checksum: row.checksum,
    status: row.status,
    installedAt: row.installed_at.toISOString(),
  };
}

/**
 * A ContentStore over the `content_pack_versions` table.
 *
 * The primary key is (language_code, version), so recording the same pair
 * again updates that row. Rows with the same `installed_at` come back in
 * descending `version` order: stable, but not the "later write first" of the
 * in memory store. A language code that is not in the `languages` table is
 * rejected by the foreign key (Postgres error 23503).
 */
export function createPostgresContentStore(db: Database): ContentStore {
  return {
    async recordVersion(input: RecordVersionInput): Promise<PackVersionRecord> {
      const installedAt = new Date(input.installedAt ?? Date.now()).toISOString();
      const write = (): Promise<VersionRow> =>
        db.transaction().execute(async (trx) => {
          // Writers of one language queue up on its row in `languages`. The
          // second one then sees what the first committed, so its supersede
          // step finds the row to demote. `for no key update` does not block
          // the foreign key checks of other tables.
          await trx
            .selectFrom('languages')
            .select('code')
            .where('code', '=', input.language)
            .forNoKeyUpdate()
            .execute();
          if (input.status === 'active') {
            // Before the new row becomes active, never after: the index
            // content_pack_versions_one_active_key allows one active row.
            await trx
              .updateTable('content_pack_versions')
              .set({ status: 'superseded' })
              .where('language_code', '=', input.language)
              .where('status', '=', 'active')
              .where('version', '<>', input.version)
              .execute();
          }
          return trx
            .insertInto('content_pack_versions')
            .values({
              language_code: input.language,
              version: input.version,
              checksum: input.checksum,
              status: input.status,
              installed_at: installedAt,
            })
            .onConflict((conflict) =>
              conflict.columns(['language_code', 'version']).doUpdateSet({
                checksum: input.checksum,
                status: input.status,
                installed_at: installedAt,
              }),
            )
            .returningAll()
            .executeTakeFirstOrThrow();
        });

      try {
        return toRecord(input.language, await write());
      } catch (error) {
        // 23505 unique_violation can only be the one active index here, since
        // the primary key is handled by `on conflict`. It means a writer that
        // did not take the lock made another version active while this
        // transaction ran. That row is committed now, so one more try sees it.
        if (errorCode(error) !== '23505') throw error;
        return toRecord(input.language, await write());
      }
    },

    async activeVersion(language: LanguageCode): Promise<PackVersionRecord | null> {
      const row = await withUser(db, null, (trx) =>
        trx
          .selectFrom('content_pack_versions')
          .selectAll()
          .where('language_code', '=', language)
          .where('status', '=', 'active')
          .orderBy('installed_at', 'desc')
          .orderBy('version', 'desc')
          .executeTakeFirst(),
      );
      return row ? toRecord(language, row) : null;
    },

    async listVersions(language: LanguageCode): Promise<PackVersionRecord[]> {
      const rows = await withUser(db, null, (trx) =>
        trx
          .selectFrom('content_pack_versions')
          .selectAll()
          .where('language_code', '=', language)
          .orderBy('installed_at', 'desc')
          .orderBy('version', 'desc')
          .execute(),
      );
      return rows.map((row) => toRecord(language, row));
    },
  };
}
