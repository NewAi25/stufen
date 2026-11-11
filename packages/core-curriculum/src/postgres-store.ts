// Postgres adapter for the CurriculumStore and SnapshotWriter ports (P1-27).
//
// Access model. Reads run inside withUser(db, null, fn): as the restricted
// role stufen_app with nobody signed in. The content policies let that role
// read and nothing else, so every read here also shows the policies hold.
// replaceLanguage is owner work. It uses `db` directly, in one transaction,
// because the restricted role may not write content.
//
// The tables are `cando_descriptors`, `units`, `lessons`, `exercises` and
// `items`, plus `languages.pack_version` for the installed version.
import { EXERCISE_TYPES, LANGUAGE_CODES } from '@stufen/contracts';
import type {
  Cando,
  CefrLevel,
  CurriculumSnapshot,
  Exercise,
  ExerciseTypeId,
  Item,
  LanguageCode,
  Lesson,
  LessonSummary,
  MasteryRule,
  SnapshotWriter,
  Unit,
} from '@stufen/contracts';
import { sql, withUser } from '@stufen/db';
import type { Database, DatabaseTransaction, NewRow, Row } from '@stufen/db';
import { byLevelThenCode, byLevelThenKey, byLevelThenOrdinal, byOrdinal } from './order';
import { assertValidSnapshot, InvalidSnapshotError } from './store';
import type { CandoFilter, CurriculumStore } from './store';

// ---------- mapping: the one place that knows the column names ----------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids are uuid columns. Anything else cannot be a stored id and is never sent to Postgres. */
function isUuid(value: string): boolean {
  return UUID.test(value);
}

function toLanguageCode(value: string): LanguageCode {
  const found = LANGUAGE_CODES.find((code) => code === value);
  if (!found) throw new Error(`Language code "${value}" in the database is not in LANGUAGE_CODES`);
  return found;
}

function toExerciseType(value: string): ExerciseTypeId {
  const found = EXERCISE_TYPES.find((type) => type === value);
  if (!found) throw new Error(`Exercise type "${value}" in the database is not in EXERCISE_TYPES`);
  return found;
}

const MASTERY_RULE_KEYS = [
  'evidenceCount',
  'distinctExerciseTypes',
  'recentAccuracy',
  'bestProductionScore',
] as const satisfies readonly (keyof MasteryRule)[];

/** `mastery_rule` holds the contracts MasteryRule as JSON. Only its known number fields are read. */
function toMasteryRule(value: Row<'cando_descriptors'>['mastery_rule']): MasteryRule | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const rule: MasteryRule = {};
  for (const key of MASTERY_RULE_KEYS) {
    const field = value[key];
    if (typeof field === 'number') rule[key] = field;
  }
  return rule;
}

function candoFromRow(row: Row<'cando_descriptors'>): Cando {
  return {
    id: row.id,
    languageCode: row.language_code === null ? null : toLanguageCode(row.language_code),
    level: row.level,
    skill: row.skill,
    code: row.code,
    textEn: row.text_en,
    textNative: row.text_native,
    source: row.source,
    masteryRule: toMasteryRule(row.mastery_rule),
  };
}

function unitFromRow(row: Row<'units'>): Unit {
  return {
    id: row.id,
    languageCode: toLanguageCode(row.language_code),
    level: row.level,
    ordinal: row.ordinal,
    slug: row.slug,
    title: row.title,
    description: row.description,
    packVersion: row.pack_version,
    titleEn: row.title_en,
  };
}

function summaryFromRow(row: Row<'lessons'>): LessonSummary {
  return {
    id: row.id,
    unitId: row.unit_id,
    ordinal: row.ordinal,
    slug: row.slug,
    title: row.title,
    kind: row.kind,
    estimatedMinutes: row.estimated_minutes,
    candoIds: [...row.cando_ids],
    packVersion: row.pack_version,
    titleEn: row.title_en,
    description: row.description,
    introducesItemIds: [...row.introduces_item_ids],
  };
}

function exerciseFromRow(row: Row<'exercises'>): Exercise {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    ordinal: row.ordinal,
    type: toExerciseType(row.type),
    skill: row.skill,
    payload: row.payload,
    candoIds: [...row.cando_ids],
    itemIds: [...row.item_ids],
    packVersion: row.pack_version,
    instructionEn: row.instruction_en,
    instructionNative: row.instruction_native,
  };
}

function itemFromRow(row: Row<'items'>): Item {
  return {
    id: row.id,
    languageCode: toLanguageCode(row.language_code),
    kind: row.kind,
    key: row.key,
    lemma: row.lemma,
    glossEn: row.gloss_en,
    level: row.level,
    frequencyRank: row.frequency_rank,
    payload: row.payload,
    packVersion: row.pack_version,
  };
}

/**
 * A value for a jsonb column. Always sent as JSON text: pg would send a bare
 * JS array as a Postgres array, and a bare string would not be read as JSON.
 */
function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function candoToRow(cando: Cando): NewRow<'cando_descriptors'> {
  return {
    id: cando.id,
    language_code: cando.languageCode,
    level: cando.level,
    skill: cando.skill,
    code: cando.code,
    text_en: cando.textEn,
    text_native: cando.textNative,
    source: cando.source,
    mastery_rule: cando.masteryRule === null ? null : toJson(cando.masteryRule),
  };
}

function itemToRow(item: Item): NewRow<'items'> {
  return {
    id: item.id,
    language_code: item.languageCode,
    kind: item.kind,
    key: item.key,
    lemma: item.lemma,
    gloss_en: item.glossEn,
    level: item.level,
    frequency_rank: item.frequencyRank,
    payload: toJson(item.payload),
    pack_version: item.packVersion,
  };
}

// The optional fields of a unit, lesson and exercise (titleEn, description,
// introducesItemIds, instructionEn, instructionNative) have nullable columns,
// and the id list defaults to empty. A field the snapshot leaves out is written
// as null or as an empty list, also on update, so a value from an older pack
// does not stay behind. On the way out a null column is null.
function unitToRow(unit: Unit): NewRow<'units'> {
  return {
    id: unit.id,
    language_code: unit.languageCode,
    level: unit.level,
    ordinal: unit.ordinal,
    slug: unit.slug,
    title: unit.title,
    description: unit.description,
    pack_version: unit.packVersion,
    title_en: unit.titleEn ?? null,
  };
}

function lessonToRow(lesson: LessonSummary): NewRow<'lessons'> {
  return {
    id: lesson.id,
    unit_id: lesson.unitId,
    ordinal: lesson.ordinal,
    slug: lesson.slug,
    title: lesson.title,
    kind: lesson.kind,
    estimated_minutes: lesson.estimatedMinutes,
    cando_ids: lesson.candoIds,
    pack_version: lesson.packVersion,
    title_en: lesson.titleEn ?? null,
    description: lesson.description ?? null,
    introduces_item_ids: lesson.introducesItemIds ?? [],
  };
}

function exerciseToRow(exercise: Exercise): NewRow<'exercises'> {
  return {
    id: exercise.id,
    lesson_id: exercise.lessonId,
    ordinal: exercise.ordinal,
    type: exercise.type,
    skill: exercise.skill,
    payload: toJson(exercise.payload),
    cando_ids: exercise.candoIds,
    item_ids: exercise.itemIds,
    pack_version: exercise.packVersion,
    instruction_en: exercise.instructionEn ?? null,
    instruction_native: exercise.instructionNative ?? null,
  };
}

// ---------- reads: each runs inside a withUser(db, null) transaction ----------
// Lists are sorted here with the comparators of order.ts and not by the
// database, so the order does not depend on the collation of the database.

async function selectCandos(
  trx: DatabaseTransaction,
  language: LanguageCode,
  filter: CandoFilter,
): Promise<Cando[]> {
  let query = trx
    .selectFrom('cando_descriptors')
    .selectAll()
    .where((eb) => eb.or([eb('language_code', '=', language), eb('language_code', 'is', null)]));
  if (filter.level !== undefined) query = query.where('level', '=', filter.level);
  if (filter.skill !== undefined) query = query.where('skill', '=', filter.skill);
  return (await query.execute()).map(candoFromRow).sort(byLevelThenCode);
}

async function selectCando(trx: DatabaseTransaction, id: string): Promise<Cando | null> {
  const row = await trx
    .selectFrom('cando_descriptors')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
  return row ? candoFromRow(row) : null;
}

async function selectUnits(
  trx: DatabaseTransaction,
  language: LanguageCode,
  level: CefrLevel | undefined,
): Promise<Unit[]> {
  let query = trx.selectFrom('units').selectAll().where('language_code', '=', language);
  if (level !== undefined) query = query.where('level', '=', level);
  return (await query.execute()).map(unitFromRow).sort(byLevelThenOrdinal);
}

async function selectLessonSummaries(
  trx: DatabaseTransaction,
  unitId: string,
): Promise<LessonSummary[]> {
  const rows = await trx.selectFrom('lessons').selectAll().where('unit_id', '=', unitId).execute();
  return rows.map(summaryFromRow).sort(byOrdinal);
}

async function selectLesson(trx: DatabaseTransaction, lessonId: string): Promise<Lesson | null> {
  const row = await trx
    .selectFrom('lessons')
    .selectAll()
    .where('id', '=', lessonId)
    .executeTakeFirst();
  if (!row) return null;
  const exercises = await trx
    .selectFrom('exercises')
    .selectAll()
    .where('lesson_id', '=', lessonId)
    .execute();
  return { ...summaryFromRow(row), exercises: exercises.map(exerciseFromRow).sort(byOrdinal) };
}

async function selectLessonUnit(trx: DatabaseTransaction, lessonId: string): Promise<Unit | null> {
  const row = await trx
    .selectFrom('units')
    .innerJoin('lessons', 'lessons.unit_id', 'units.id')
    .selectAll('units')
    .where('lessons.id', '=', lessonId)
    .executeTakeFirst();
  return row ? unitFromRow(row) : null;
}

async function selectItemsById(trx: DatabaseTransaction, ids: readonly string[]): Promise<Item[]> {
  const wanted = [...new Set(ids.filter(isUuid).map((id) => id.toLowerCase()))];
  if (wanted.length === 0) return [];
  const rows = await trx.selectFrom('items').selectAll().where('id', 'in', wanted).execute();
  const byId = new Map(rows.map((row) => [row.id, itemFromRow(row)]));
  return wanted.flatMap((id) => byId.get(id) ?? []);
}

async function selectItems(
  trx: DatabaseTransaction,
  language: LanguageCode,
  level: CefrLevel | undefined,
): Promise<Item[]> {
  let query = trx.selectFrom('items').selectAll().where('language_code', '=', language);
  if (level !== undefined) query = query.where('level', '=', level);
  return (await query.execute()).map(itemFromRow).sort(byLevelThenKey);
}

async function selectPackVersion(
  trx: DatabaseTransaction,
  language: LanguageCode,
): Promise<string | null> {
  const row = await trx
    .selectFrom('languages')
    .select('pack_version')
    .where('code', '=', language)
    .executeTakeFirst();
  return row?.pack_version ?? null;
}

// ---------- replaceLanguage: owner work, one transaction ----------

/** Rows per insert statement. Keeps a statement far below the 65535 parameter limit of Postgres. */
const BATCH = 500;

function batches<T>(rows: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let start = 0; start < rows.length; start += BATCH)
    out.push(rows.slice(start, start + BATCH));
  return out;
}

/** The snapshot as flat lists, parents before children. */
function flatten(snapshot: CurriculumSnapshot) {
  const lessons = snapshot.units.flatMap((unit) => unit.lessons);
  const exercises = lessons.flatMap((lesson) => lesson.exercises);
  return {
    candos: snapshot.candos,
    items: snapshot.items,
    units: snapshot.units,
    lessons,
    exercises,
  };
}

type FlatSnapshot = ReturnType<typeof flatten>;

/** Every id column is uuid, and so are the id arrays on lessons and exercises. */
function assertUuids(language: LanguageCode, flat: FlatSnapshot): void {
  const all = [
    ...[flat.candos, flat.items, flat.units, flat.lessons, flat.exercises].flatMap((rows) =>
      rows.map((row) => row.id),
    ),
    ...flat.lessons.flatMap((lesson) => [...lesson.candoIds, ...(lesson.introducesItemIds ?? [])]),
    ...flat.exercises.flatMap((exercise) => [...exercise.candoIds, ...exercise.itemIds]),
  ];
  const bad = all.find((id) => !isUuid(id));
  if (bad !== undefined) throw new InvalidSnapshotError(language, `"${bad}" is not a uuid`);
}

/**
 * An id of the snapshot may already be stored, but only for the same
 * language (or, for a common descriptor, as a common descriptor). Otherwise
 * the upsert would take a row away from another language.
 */
async function assertIdsNotTaken(
  trx: DatabaseTransaction,
  language: LanguageCode,
  flat: FlatSnapshot,
): Promise<void> {
  const idsOf = (rows: readonly { id: string }[]) => rows.map((row) => row.id);
  const ownCandos = idsOf(flat.candos.filter((cando) => cando.languageCode !== null));
  const commonCandos = idsOf(flat.candos.filter((cando) => cando.languageCode === null));
  const found: (string | undefined)[] = [];
  const first = async (query: { executeTakeFirst(): Promise<{ id: string } | undefined> }) =>
    found.push((await query.executeTakeFirst())?.id);

  for (const ids of batches(ownCandos)) {
    await first(
      trx
        .selectFrom('cando_descriptors')
        .select('id')
        .where('id', 'in', ids)
        .where((eb) =>
          eb.or([eb('language_code', 'is', null), eb('language_code', '!=', language)]),
        ),
    );
  }
  for (const ids of batches(commonCandos)) {
    await first(
      trx
        .selectFrom('cando_descriptors')
        .select('id')
        .where('id', 'in', ids)
        .where('language_code', 'is not', null),
    );
  }
  for (const table of ['items', 'units'] as const) {
    for (const ids of batches(idsOf(flat[table]))) {
      await first(
        trx
          .selectFrom(table)
          .select('id')
          .where('id', 'in', ids)
          .where('language_code', '!=', language),
      );
    }
  }
  for (const ids of batches(idsOf(flat.lessons))) {
    await first(
      trx
        .selectFrom('lessons')
        .innerJoin('units', 'units.id', 'lessons.unit_id')
        .select('lessons.id')
        .where('lessons.id', 'in', ids)
        .where('units.language_code', '!=', language),
    );
  }
  for (const ids of batches(idsOf(flat.exercises))) {
    await first(
      trx
        .selectFrom('exercises')
        .innerJoin('lessons', 'lessons.id', 'exercises.lesson_id')
        .innerJoin('units', 'units.id', 'lessons.unit_id')
        .select('exercises.id')
        .where('exercises.id', 'in', ids)
        .where('units.language_code', '!=', language),
    );
  }
  const taken = found.find((id) => id !== undefined);
  if (taken !== undefined) {
    throw new InvalidSnapshotError(
      language,
      `id ${taken} is already stored for another language or as a common descriptor`,
    );
  }
}

/**
 * Inserts the rows of the snapshot, or updates the row with the same id in
 * place. A row that is still part of the pack is never deleted and inserted
 * again, because learner tables point at these ids and some of those foreign
 * keys cascade. `created_at` keeps the time of the first install.
 */
async function upsertSnapshot(trx: DatabaseTransaction, flat: FlatSnapshot): Promise<void> {
  for (const rows of batches(flat.candos.map(candoToRow))) {
    await trx
      .insertInto('cando_descriptors')
      .values(rows)
      .onConflict((conflict) =>
        conflict.column('id').doUpdateSet((eb) => ({
          level: eb.ref('excluded.level'),
          skill: eb.ref('excluded.skill'),
          code: eb.ref('excluded.code'),
          text_en: eb.ref('excluded.text_en'),
          text_native: eb.ref('excluded.text_native'),
          source: eb.ref('excluded.source'),
          mastery_rule: eb.ref('excluded.mastery_rule'),
        })),
      )
      .execute();
  }
  for (const rows of batches(flat.items.map(itemToRow))) {
    await trx
      .insertInto('items')
      .values(rows)
      .onConflict((conflict) =>
        conflict.column('id').doUpdateSet((eb) => ({
          kind: eb.ref('excluded.kind'),
          key: eb.ref('excluded.key'),
          lemma: eb.ref('excluded.lemma'),
          gloss_en: eb.ref('excluded.gloss_en'),
          level: eb.ref('excluded.level'),
          frequency_rank: eb.ref('excluded.frequency_rank'),
          payload: eb.ref('excluded.payload'),
          pack_version: eb.ref('excluded.pack_version'),
        })),
      )
      .execute();
  }
  for (const rows of batches(flat.units.map(unitToRow))) {
    await trx
      .insertInto('units')
      .values(rows)
      .onConflict((conflict) =>
        conflict.column('id').doUpdateSet((eb) => ({
          level: eb.ref('excluded.level'),
          ordinal: eb.ref('excluded.ordinal'),
          slug: eb.ref('excluded.slug'),
          title: eb.ref('excluded.title'),
          description: eb.ref('excluded.description'),
          pack_version: eb.ref('excluded.pack_version'),
          title_en: eb.ref('excluded.title_en'),
        })),
      )
      .execute();
  }
  for (const rows of batches(flat.lessons.map(lessonToRow))) {
    await trx
      .insertInto('lessons')
      .values(rows)
      .onConflict((conflict) =>
        conflict.column('id').doUpdateSet((eb) => ({
          unit_id: eb.ref('excluded.unit_id'),
          ordinal: eb.ref('excluded.ordinal'),
          slug: eb.ref('excluded.slug'),
          title: eb.ref('excluded.title'),
          kind: eb.ref('excluded.kind'),
          estimated_minutes: eb.ref('excluded.estimated_minutes'),
          cando_ids: eb.ref('excluded.cando_ids'),
          pack_version: eb.ref('excluded.pack_version'),
          title_en: eb.ref('excluded.title_en'),
          description: eb.ref('excluded.description'),
          introduces_item_ids: eb.ref('excluded.introduces_item_ids'),
        })),
      )
      .execute();
  }
  for (const rows of batches(flat.exercises.map(exerciseToRow))) {
    await trx
      .insertInto('exercises')
      .values(rows)
      .onConflict((conflict) =>
        conflict.column('id').doUpdateSet((eb) => ({
          lesson_id: eb.ref('excluded.lesson_id'),
          ordinal: eb.ref('excluded.ordinal'),
          type: eb.ref('excluded.type'),
          skill: eb.ref('excluded.skill'),
          payload: eb.ref('excluded.payload'),
          cando_ids: eb.ref('excluded.cando_ids'),
          item_ids: eb.ref('excluded.item_ids'),
          pack_version: eb.ref('excluded.pack_version'),
          instruction_en: eb.ref('excluded.instruction_en'),
          instruction_native: eb.ref('excluded.instruction_native'),
        })),
      )
      .execute();
  }
}

/** True when `column` is none of `ids`. One array parameter, so the list may be of any length. */
function notOneOf(column: string, ids: readonly string[]) {
  return sql<boolean>`${sql.ref(column)} <> all(${[...ids]}::uuid[])`;
}

function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23503';
}

/**
 * Deletes the rows of the language that the snapshot no longer carries,
 * children before parents. It runs after the upsert, so a lesson or exercise
 * that moved to another parent is already there and is not caught by a
 * cascade. Common descriptors have no language and are never deleted here.
 */
async function deleteRemoved(
  trx: DatabaseTransaction,
  language: LanguageCode,
  flat: FlatSnapshot,
): Promise<void> {
  const idsOf = (rows: readonly { id: string }[]) => rows.map((row) => row.id);
  await trx
    .deleteFrom('exercises')
    .where('lesson_id', 'in', (eb) =>
      eb
        .selectFrom('lessons')
        .innerJoin('units', 'units.id', 'lessons.unit_id')
        .select('lessons.id')
        .where('units.language_code', '=', language),
    )
    .where(notOneOf('exercises.id', idsOf(flat.exercises)))
    .execute();
  try {
    await trx
      .deleteFrom('lessons')
      .where('unit_id', 'in', (eb) =>
        eb.selectFrom('units').select('units.id').where('units.language_code', '=', language),
      )
      .where(notOneOf('lessons.id', idsOf(flat.lessons)))
      .execute();
  } catch (error) {
    // lesson_sessions.lesson_id references lessons without a delete rule.
    if (!isForeignKeyViolation(error)) throw error;
    throw new Error(
      `Cannot remove a lesson of "${language}" that learners have sessions on ` +
        '(lesson_sessions.lesson_id). Nothing was changed. Keep the lesson in the pack.',
      { cause: error },
    );
  }
  await trx
    .deleteFrom('units')
    .where('language_code', '=', language)
    .where(notOneOf('units.id', idsOf(flat.units)))
    .execute();
  await trx
    .deleteFrom('items')
    .where('language_code', '=', language)
    .where(notOneOf('items.id', idsOf(flat.items)))
    .execute();
  await trx
    .deleteFrom('cando_descriptors')
    .where('language_code', '=', language)
    .where(notOneOf('cando_descriptors.id', idsOf(flat.candos)))
    .execute();
}

// ---------- the adapter ----------

/**
 * The curriculum store on PostgreSQL. `db` is the owner connection from
 * createDb. Reads switch to the restricted role for their transaction;
 * replaceLanguage stays on the owner connection.
 */
export function createPostgresCurriculumStore(db: Database): CurriculumStore & SnapshotWriter {
  /** One read transaction as the restricted role, with nobody signed in. */
  const read = <T>(fn: (trx: DatabaseTransaction) => Promise<T>): Promise<T> =>
    withUser(db, null, fn);

  return {
    listCandos: (language, filter = {}) => read((trx) => selectCandos(trx, language, filter)),
    getCando: async (id) => (isUuid(id) ? read((trx) => selectCando(trx, id)) : null),
    listUnits: (language, level) => read((trx) => selectUnits(trx, language, level)),
    listLessonSummaries: async (unitId) =>
      isUuid(unitId) ? read((trx) => selectLessonSummaries(trx, unitId)) : [],
    getLesson: async (lessonId) =>
      isUuid(lessonId) ? read((trx) => selectLesson(trx, lessonId)) : null,
    getItems: (ids) => read((trx) => selectItemsById(trx, ids)),
    listItems: (language, level) => read((trx) => selectItems(trx, language, level)),
    findLessonUnit: async (lessonId) =>
      isUuid(lessonId) ? read((trx) => selectLessonUnit(trx, lessonId)) : null,
    activeVersion: (language) => read((trx) => selectPackVersion(trx, language)),

    async replaceLanguage(snapshot: CurriculumSnapshot): Promise<void> {
      assertValidSnapshot(snapshot);
      const { language } = snapshot;
      const flat = flatten(snapshot);
      assertUuids(language, flat);

      await db.transaction().execute(async (trx) => {
        // The row lock makes two installs of one language wait for each other.
        const known = await trx
          .selectFrom('languages')
          .select('code')
          .where('code', '=', language)
          .forUpdate()
          .executeTakeFirst();
        if (!known) throw new InvalidSnapshotError(language, 'the language is not in `languages`');

        await assertIdsNotTaken(trx, language, flat);
        await upsertSnapshot(trx, flat);
        await deleteRemoved(trx, language, flat);
        await trx
          .updateTable('languages')
          .set({ pack_version: snapshot.version })
          .where('code', '=', language)
          .execute();
      });
    },
  };
}
