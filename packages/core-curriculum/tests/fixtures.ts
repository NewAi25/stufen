// A small installed curriculum for the tests. Rows are listed out of order on
// purpose (A2 before A1, ordinal 2 before ordinal 1) so that a test which
// passes proves the code sorts, not that the fixture was already sorted.
import type {
  Cando,
  CurriculumSnapshot,
  Exercise,
  Item,
  Lesson,
  UnitWithLessons,
} from '@stufen/contracts';

const VERSION = '0.1.0';

function cando(overrides: Partial<Cando> & Pick<Cando, 'id' | 'code'>): Cando {
  return {
    languageCode: 'de',
    level: 'A1',
    skill: 'listening',
    textEn: `Can do ${overrides.code}`,
    textNative: null,
    source: 'unverified',
    masteryRule: null,
    ...overrides,
  };
}

function exercise(id: string, lessonId: string, ordinal: number): Exercise {
  return {
    id,
    lessonId,
    ordinal,
    type: 'multiple_choice',
    skill: 'vocabulary',
    payload: { prompt: id },
    candoIds: ['cando-de-a1-lis-01'],
    itemIds: ['item-de-haus'],
    packVersion: VERSION,
  };
}

function lesson(id: string, unitId: string, ordinal: number, exerciseOrdinals: number[]): Lesson {
  return {
    id,
    unitId,
    ordinal,
    slug: id,
    title: `Lesson ${id}`,
    kind: 'core',
    estimatedMinutes: 10,
    candoIds: ['cando-de-a1-lis-01'],
    packVersion: VERSION,
    exercises: exerciseOrdinals.map((n) => exercise(`${id}-ex-${n}`, id, n)),
  };
}

function item(overrides: Partial<Item> & Pick<Item, 'id' | 'key'>): Item {
  return {
    languageCode: 'de',
    kind: 'vocab',
    lemma: overrides.key,
    glossEn: 'gloss',
    level: 'A1',
    frequencyRank: null,
    payload: {},
    packVersion: VERSION,
    ...overrides,
  };
}

const unitA2: UnitWithLessons = {
  id: 'unit-de-a2-1',
  languageCode: 'de',
  level: 'A2',
  ordinal: 1,
  slug: 'a2-unterwegs',
  title: 'Unterwegs',
  description: null,
  packVersion: VERSION,
  lessons: [lesson('lesson-de-a2-1-1', 'unit-de-a2-1', 1, [1])],
};

const unitA1: UnitWithLessons = {
  id: 'unit-de-a1-1',
  languageCode: 'de',
  level: 'A1',
  ordinal: 1,
  slug: 'a1-hallo',
  title: 'Hallo',
  description: 'First words',
  packVersion: VERSION,
  lessons: [
    lesson('lesson-de-a1-1-2', 'unit-de-a1-1', 2, [1, 2]),
    lesson('lesson-de-a1-1-1', 'unit-de-a1-1', 1, [3, 1, 2]),
  ],
};

/** German: two levels, two units, three lessons, four candos (one common), three items. */
export function germanSnapshot(): CurriculumSnapshot {
  return structuredClone({
    language: 'de',
    version: VERSION,
    candos: [
      cando({ id: 'cando-de-a2-wri-01', code: 'A2.WRI.01', level: 'A2', skill: 'writing' }),
      cando({ id: 'cando-de-a1-lis-02', code: 'A1.LIS.02' }),
      cando({
        id: 'cando-common-a1-rea-01',
        code: 'A1.REA.01',
        languageCode: null,
        skill: 'reading',
      }),
      cando({ id: 'cando-de-a1-lis-01', code: 'A1.LIS.01' }),
    ],
    items: [
      item({ id: 'item-de-reise', key: 'de:vocab:reise', level: 'A2' }),
      item({ id: 'item-de-haus', key: 'de:vocab:haus' }),
      item({ id: 'item-de-auto', key: 'de:vocab:auto' }),
    ],
    units: [unitA2, unitA1],
  } satisfies CurriculumSnapshot);
}

function dutchUnit(ordinal: number): UnitWithLessons {
  const id = `unit-nl-a1-${ordinal}`;
  return {
    id,
    languageCode: 'nl',
    level: 'A1',
    ordinal,
    slug: `a1-nl-${ordinal}`,
    title: `Dutch unit ${ordinal}`,
    description: null,
    packVersion: VERSION,
    lessons: [lesson(`lesson-nl-a1-${ordinal}-1`, id, 1, [1])],
  };
}

/**
 * Dutch: one level, two units listed second first, one cando of its own, one
 * item. It carries the same common descriptor id as the German pack.
 */
export function dutchSnapshot(): CurriculumSnapshot {
  return structuredClone({
    language: 'nl',
    version: '0.2.0',
    candos: [
      cando({ id: 'cando-nl-a1-lis-01', code: 'A1.LIS.01', languageCode: 'nl' }),
      cando({
        id: 'cando-common-a1-rea-01',
        code: 'A1.REA.01',
        languageCode: null,
        skill: 'reading',
      }),
    ],
    items: [item({ id: 'item-nl-huis', key: 'nl:vocab:huis', languageCode: 'nl' })],
    units: [dutchUnit(2), dutchUnit(1)],
  } satisfies CurriculumSnapshot);
}
