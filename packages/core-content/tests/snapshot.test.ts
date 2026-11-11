// buildSnapshot (P1-03) on the fixture pack: ids, mapping, order, determinism.
import { describe, expect, it } from 'vitest';
import { buildSnapshot, stableId } from '../src/index';
import { makePack, makePackData, toPack } from './helpers/pack';

describe('buildSnapshot on the fixture', () => {
  it('is deterministic: building twice gives deep equal snapshots', () => {
    const pack = makePack();

    expect(buildSnapshot(pack)).toEqual(buildSnapshot(pack));
    expect(buildSnapshot(makePack())).toEqual(buildSnapshot(pack));
  });

  it('does not change the pack data and shares no payload object with it', () => {
    const data = makePackData();
    const before = structuredClone(data);

    const snapshot = buildSnapshot({ ...toPack(data), loadItems: () => data.items });

    expect(data).toEqual(before);
    expect(snapshot.items[0]?.payload).toEqual(data.items[0]?.payload);
    expect(snapshot.items[0]?.payload).not.toBe(data.items[0]?.payload);
  });

  it('sets language, version and packVersion from the pack', () => {
    const snapshot = buildSnapshot(makePack());

    expect(snapshot.language).toBe('nl');
    expect(snapshot.version).toBe('0.1.0');
    const versions = [
      ...snapshot.items.map((item) => item.packVersion),
      ...snapshot.units.map((unit) => unit.packVersion),
      ...snapshot.units.flatMap((unit) => unit.lessons.map((lesson) => lesson.packVersion)),
      ...snapshot.units.flatMap((unit) =>
        unit.lessons.flatMap((lesson) => lesson.exercises.map((exercise) => exercise.packVersion)),
      ),
    ];
    expect(new Set(versions)).toEqual(new Set(['0.1.0']));
  });

  it('maps a descriptor and an item to the domain shape', () => {
    const snapshot = buildSnapshot(
      makePack((data) => {
        const [cando] = data.candos;
        const [item] = data.items;
        if (!cando || !item) throw new Error('fixture');
        cando.text_native = 'Kan groeten.';
        cando.mastery_rule = { evidence_count: 4, recent_accuracy: 0.8 };
        item.frequency_rank = 12;
      }),
    );

    expect(snapshot.candos[0]).toEqual({
      id: stableId('nl:cando:A1.VOC.01'),
      languageCode: 'nl',
      level: 'A1',
      skill: 'vocabulary',
      code: 'A1.VOC.01',
      textEn: 'Can do A1.VOC.01.',
      textNative: 'Kan groeten.',
      source: 'unverified',
      masteryRule: { evidenceCount: 4, recentAccuracy: 0.8 },
    });
    expect(snapshot.candos[1]).toMatchObject({ textNative: null, masteryRule: null });
    expect(snapshot.items[0]).toEqual({
      id: stableId('nl:vocab:hallo'),
      languageCode: 'nl',
      kind: 'vocab',
      key: 'nl:vocab:hallo',
      lemma: 'hallo',
      glossEn: 'gloss of hallo',
      level: 'A1',
      frequencyRank: 12,
      payload: { pos: 'interjection', examples: [{ text: 'hallo', gloss_en: 'hallo' }] },
      packVersion: '0.1.0',
    });
    expect(snapshot.items[1]?.frequencyRank).toBeNull();
  });
});

describe('buildSnapshot: units, lessons and exercises', () => {
  it('derives ids from the pack keys and links children to parents', () => {
    const snapshot = buildSnapshot(makePack());
    const [unit] = snapshot.units;
    const [lesson] = unit?.lessons ?? [];
    const [exercise] = lesson?.exercises ?? [];

    expect(unit).toMatchObject({
      id: stableId('nl:unit:a1-01-hallo'),
      languageCode: 'nl',
      level: 'A1',
      ordinal: 1,
      slug: 'hallo',
      title: 'Hallo',
      description: 'Greetings.',
    });
    expect(snapshot.units[1]?.description).toBeNull();
    expect(lesson).toMatchObject({
      id: stableId('nl:lesson:a1-01-01'),
      unitId: unit?.id,
      ordinal: 1,
      slug: 'hallo-dag',
      title: 'Les 1',
      kind: 'core',
      estimatedMinutes: 10,
      candoIds: [stableId('nl:cando:A1.VOC.01'), stableId('nl:cando:A1.LIS.01')],
    });
    expect(exercise).toEqual({
      id: stableId('nl:lesson:a1-01-01#nl:exercise:a1-01-01-01'),
      lessonId: lesson?.id,
      ordinal: 1,
      type: 'flashcard',
      skill: 'vocabulary',
      payload: { front: 'hallo', back: 'hello' },
      candoIds: [stableId('nl:cando:A1.VOC.01')],
      itemIds: [stableId('nl:vocab:hallo')],
      packVersion: '0.1.0',
    });
  });

  it('puts units, lessons and exercises in ordinal order, whatever the pack order', () => {
    const snapshot = buildSnapshot(
      makePack((data) => {
        data.units.reverse();
      }),
    );

    expect(snapshot.units.map((unit) => unit.slug)).toEqual(['hallo', 'familie']);
    expect(snapshot.units[0]?.lessons.map((lesson) => lesson.ordinal)).toEqual([1, 2]);
    expect(snapshot.units[0]?.lessons[0]?.exercises.map((exercise) => exercise.ordinal)).toEqual([
      1, 2,
    ]);
    expect(snapshot).toEqual(buildSnapshot(makePack()));
  });

  it('orders units by level first, then by ordinal', () => {
    const snapshot = buildSnapshot(
      makePack((data) => {
        const [first] = data.units;
        if (first) first.level = 'B1';
      }),
    );

    expect(snapshot.units.map((unit) => [unit.level, unit.slug])).toEqual([
      ['A1', 'familie'],
      ['B1', 'hallo'],
    ]);
  });

  it('keeps every id when the content of a record changes but its key does not', () => {
    const before = buildSnapshot(makePack());
    const after = buildSnapshot(
      makePack((data) => {
        data.manifest.version = '0.2.0';
        const [item] = data.items;
        const [unit] = data.units;
        if (!item || !unit) throw new Error('fixture');
        item.gloss_en = 'hi';
        unit.title = 'Hallo!';
      }),
    );
    const ids = (snapshot: typeof before) => [
      ...snapshot.candos.map((cando) => cando.id),
      ...snapshot.items.map((item) => item.id),
      ...snapshot.units.flatMap((unit) => [
        unit.id,
        ...unit.lessons.flatMap((lesson) => [lesson.id, ...lesson.exercises.map((e) => e.id)]),
      ]),
    ];

    expect(after.version).toBe('0.2.0');
    expect(ids(after)).toEqual(ids(before));
    expect(new Set(ids(before)).size).toBe(ids(before).length);
  });

  it('falls back to the derived keys for records without a key', () => {
    const snapshot = buildSnapshot(
      makePack((data) => {
        const unit = data.units[1];
        const lesson = unit?.lessons[0];
        const exercise = lesson?.exercises[0];
        if (!unit || !lesson || !exercise) throw new Error('fixture');
        unit.key = '';
        lesson.key = '';
        exercise.key = '';
      }),
    );
    const unit = snapshot.units[1];

    expect(unit?.id).toBe(stableId('nl:unit:familie'));
    expect(unit?.lessons[0]?.id).toBe(stableId('nl:lesson:familie/ja-nee'));
    expect(unit?.lessons[0]?.exercises[0]?.id).toBe(stableId('nl:lesson:familie/ja-nee#1'));
  });

  it('throws for a reference that is not in the pack, naming the key', () => {
    const pack = makePack((data) => {
      data.units[0]?.lessons[0]?.exercises[0]?.item_ids.push('nl:vocab:spook');
    });

    expect(() => buildSnapshot(pack)).toThrow(/nl:vocab:spook/);
  });
});
