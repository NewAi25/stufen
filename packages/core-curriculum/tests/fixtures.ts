// A small installed curriculum for the tests. Rows are listed out of order on
// purpose (A2 before A1, ordinal 2 before ordinal 1) so that a test which
// passes proves the code sorts, not that the fixture was already sorted.
//
// Every id is a fresh uuid per fixture, because Postgres stores ids as uuid.
// Unit slugs, cando codes and item keys end in a tag that is new per fixture
// too, so two runs against one database never meet on a unique constraint.
import { randomUUID } from 'node:crypto';
import type {
  Cando,
  CurriculumSnapshot,
  Exercise,
  Item,
  LanguageCode,
  Lesson,
  UnitWithLessons,
} from '@stufen/contracts';

export const GERMAN_VERSION = '0.1.0';
export const DUTCH_VERSION = '0.2.0';

const uuids = <K extends string>(...names: K[]): Record<K, string> =>
  Object.fromEntries(names.map((name) => [name, randomUUID()])) as Record<K, string>;

function newIds() {
  return {
    cando: uuids('deA1Lis01', 'deA1Lis02', 'deA2Wri01', 'commonA1Rea01', 'nlA1Lis01'),
    item: uuids('haus', 'auto', 'reise', 'huis'),
    unit: uuids('deA1', 'deA2', 'nl1', 'nl2'),
    lesson: uuids('deA1L1', 'deA1L2', 'deA2L1', 'nl1L1', 'nl2L1'),
    /** Per lesson, the exercise ids in ordinal order. */
    exercises: {
      deA1L1: [randomUUID(), randomUUID(), randomUUID()],
      deA1L2: [randomUUID(), randomUUID()],
      deA2L1: [randomUUID()],
      nl1L1: [randomUUID()],
      nl2L1: [randomUUID()],
    },
  };
}

export type FixtureIds = ReturnType<typeof newIds>;
type LessonName = keyof FixtureIds['lesson'];

export interface Fixture {
  ids: FixtureIds;
  /** The ending of every slug, code and key of this fixture. */
  tag: string;
  /** German: two levels, two units, three lessons, four candos (one common), three items. */
  german(): CurriculumSnapshot;
  /**
   * Dutch: one level, two units listed second first, one cando of its own, one
   * item. It carries the same common descriptor as the German pack.
   */
  dutch(): CurriculumSnapshot;
  /** Every id of the fixture, for a clean up by id. */
  allIds(): string[];
}

/** A snapshot with nothing in it. Installing it removes the language's content. */
export function emptySnapshot(language: LanguageCode, version = '9.9.9'): CurriculumSnapshot {
  return { language, version, candos: [], items: [], units: [] };
}

export function createFixture(): Fixture {
  const ids = newIds();
  const tag = randomUUID().slice(0, 8);

  const cando = (id: string, code: string, overrides: Partial<Cando> = {}): Cando => ({
    id,
    languageCode: 'de',
    level: 'A1',
    skill: 'listening',
    code: `${code}-${tag}`,
    textEn: `Can do ${code}`,
    textNative: null,
    source: 'unverified',
    masteryRule: null,
    ...overrides,
  });

  const item = (id: string, word: string, overrides: Partial<Item> = {}): Item => ({
    id,
    languageCode: 'de',
    kind: 'vocab',
    key: `${overrides.languageCode ?? 'de'}:vocab:${word}-${tag}`,
    lemma: word,
    glossEn: 'gloss',
    level: 'A1',
    frequencyRank: null,
    payload: {},
    ...overrides,
    packVersion: overrides.languageCode === 'nl' ? DUTCH_VERSION : GERMAN_VERSION,
  });

  // The optional fields of contracts 0.6.0 come in three shapes on purpose:
  // lesson deA1L1 and unit deA1 carry real values, lesson deA1L2 carries
  // explicit nulls and an empty list, every other row leaves them out.
  function lessonExtras(name: LessonName): Partial<Lesson> {
    if (name === 'deA1L1') {
      return {
        titleEn: 'Hello',
        description: 'Greetings and names',
        introducesItemIds: [ids.item.haus, ids.item.auto],
      };
    }
    return name === 'deA1L2' ? { titleEn: null, description: null, introducesItemIds: [] } : {};
  }

  function exerciseExtras(name: LessonName, n: number): Partial<Exercise> {
    if (name === 'deA1L1') {
      return { instructionEn: `Choose answer ${n}`, instructionNative: `Wähle Antwort ${n}` };
    }
    return name === 'deA1L2' ? { instructionEn: 'Choose', instructionNative: null } : {};
  }

  /** A lesson whose exercises are listed in the order of `ordinals`. */
  function lesson(name: LessonName, unitId: string, ordinal: number, ordinals: number[]): Lesson {
    const id = ids.lesson[name];
    const dutch = name.startsWith('nl');
    const packVersion = dutch ? DUTCH_VERSION : GERMAN_VERSION;
    const exercises = ordinals.map((n): Exercise => ({
      id: ids.exercises[name][n - 1] as string,
      lessonId: id,
      ordinal: n,
      type: 'multiple_choice',
      skill: 'vocabulary',
      payload: { prompt: `${name} ${n}`, options: ['a', 'b'], answer: 0 },
      candoIds: [dutch ? ids.cando.nlA1Lis01 : ids.cando.deA1Lis01],
      itemIds: [dutch ? ids.item.huis : ids.item.haus],
      packVersion,
      ...exerciseExtras(name, n),
    }));
    return {
      id,
      unitId,
      ordinal,
      slug: `${name.toLowerCase()}-${tag}`,
      title: `Lesson ${name}`,
      kind: 'core',
      estimatedMinutes: 10,
      candoIds: [dutch ? ids.cando.nlA1Lis01 : ids.cando.deA1Lis01],
      packVersion,
      ...lessonExtras(name),
      exercises,
    };
  }

  const common = (): Cando =>
    cando(ids.cando.commonA1Rea01, 'A1.REA.01', { languageCode: null, skill: 'reading' });

  function germanSnapshot(): CurriculumSnapshot {
    const unitA2: UnitWithLessons = {
      id: ids.unit.deA2,
      languageCode: 'de',
      level: 'A2',
      ordinal: 1,
      slug: `a2-unterwegs-${tag}`,
      title: 'Unterwegs',
      description: null,
      packVersion: GERMAN_VERSION,
      lessons: [lesson('deA2L1', ids.unit.deA2, 1, [1])],
    };
    const unitA1: UnitWithLessons = {
      id: ids.unit.deA1,
      languageCode: 'de',
      level: 'A1',
      ordinal: 1,
      slug: `a1-hallo-${tag}`,
      title: 'Hallo',
      description: 'First words',
      packVersion: GERMAN_VERSION,
      titleEn: 'Hello',
      lessons: [
        lesson('deA1L2', ids.unit.deA1, 2, [1, 2]),
        lesson('deA1L1', ids.unit.deA1, 1, [3, 1, 2]),
      ],
    };
    return {
      language: 'de',
      version: GERMAN_VERSION,
      candos: [
        cando(ids.cando.deA2Wri01, 'A2.WRI.01', { level: 'A2', skill: 'writing' }),
        cando(ids.cando.deA1Lis02, 'A1.LIS.02', { masteryRule: { evidenceCount: 4 } }),
        common(),
        cando(ids.cando.deA1Lis01, 'A1.LIS.01', { textNative: 'Kann A1.LIS.01' }),
      ],
      items: [
        item(ids.item.reise, 'reise', { level: 'A2', frequencyRank: 900 }),
        item(ids.item.haus, 'haus', { payload: { gender: 'n', plural: 'Häuser' } }),
        item(ids.item.auto, 'auto'),
      ],
      units: [unitA2, unitA1],
    };
  }

  function dutchUnit(name: 'nl1' | 'nl2', ordinal: number): UnitWithLessons {
    return {
      id: ids.unit[name],
      languageCode: 'nl',
      level: 'A1',
      ordinal,
      slug: `a1-nl-${ordinal}-${tag}`,
      title: `Dutch unit ${ordinal}`,
      description: null,
      packVersion: DUTCH_VERSION,
      lessons: [lesson(`${name}L1`, ids.unit[name], 1, [1])],
    };
  }

  function dutchSnapshot(): CurriculumSnapshot {
    return {
      language: 'nl',
      version: DUTCH_VERSION,
      candos: [cando(ids.cando.nlA1Lis01, 'A1.LIS.01', { languageCode: 'nl' }), common()],
      items: [item(ids.item.huis, 'huis', { languageCode: 'nl' })],
      units: [dutchUnit('nl2', 2), dutchUnit('nl1', 1)],
    };
  }

  return {
    ids,
    tag,
    german: germanSnapshot,
    dutch: dutchSnapshot,
    allIds: () =>
      [ids.cando, ids.item, ids.unit, ids.lesson]
        .flatMap((group) => Object.values(group))
        .concat(Object.values(ids.exercises).flat()),
  };
}
