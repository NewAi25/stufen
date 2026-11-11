// The rules and the snapshot builder on the real German pack, read from
// content/de with fs (no import of lang-de). Content is still growing, so no
// check here counts records: every expectation is about consistency.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSnapshot, stableId, validatePackData } from '../src/index';
import { GERMAN_CONTENT_DIR, loadGermanPackFromDisk } from './helpers/pack';

const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe.skipIf(!fs.existsSync(GERMAN_CONTENT_DIR))('the German pack in content/de', () => {
  it('loads from disk as a LanguagePack with content in it', () => {
    const pack = loadGermanPackFromDisk();

    expect(pack.code).toBe('de');
    expect(pack.loadManifest().version).toBe(pack.version);
    expect(pack.loadCandos().length).toBeGreaterThan(0);
    expect(pack.loadItems().length).toBeGreaterThan(0);
    expect(pack.loadUnits().length).toBeGreaterThan(0);
  });

  it('validates with zero errors', () => {
    const report = validatePackData(loadGermanPackFromDisk());

    // Printed in full when it fails, so the broken record is named.
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.language).toBe('de');
    for (const issue of report.warnings) expect(issue.severity).toBe('warning');
  });

  it('builds the same snapshot twice', () => {
    const pack = loadGermanPackFromDisk();

    expect(buildSnapshot(pack)).toEqual(buildSnapshot(pack));
  });

  it('gives every record a distinct version 5 id derived from its pack key', () => {
    const pack = loadGermanPackFromDisk();
    const snapshot = buildSnapshot(pack);
    const lessons = snapshot.units.flatMap((unit) => unit.lessons);
    const ids = [
      ...snapshot.candos.map((cando) => cando.id),
      ...snapshot.items.map((item) => item.id),
      ...snapshot.units.map((unit) => unit.id),
      ...lessons.map((lesson) => lesson.id),
      ...lessons.flatMap((lesson) => lesson.exercises.map((exercise) => exercise.id)),
    ];

    for (const id of ids) expect(id).toMatch(UUID_V5);
    expect(new Set(ids).size).toBe(ids.length);
    expect(snapshot.candos.map((cando) => cando.id)).toEqual(
      pack.loadCandos().map((cando) => stableId(cando.key)),
    );
    expect(snapshot.items.map((item) => item.id)).toEqual(
      pack.loadItems().map((item) => stableId(item.key)),
    );
    for (const unit of pack.loadUnits()) {
      const built = snapshot.units.find((candidate) => candidate.id === stableId(unit.key));
      expect(built?.slug).toBe(unit.slug);
      for (const lesson of unit.lessons) {
        const builtLesson = built?.lessons.find(
          (candidate) => candidate.id === stableId(lesson.key),
        );
        expect(builtLesson?.slug).toBe(lesson.slug);
        expect(builtLesson?.exercises.map((exercise) => exercise.id).sort()).toEqual(
          lesson.exercises.map((exercise) => stableId(`${lesson.key}#${exercise.key}`)).sort(),
        );
      }
    }
  });

  it('resolves every candoIds and itemIds entry to an id present in the snapshot', () => {
    const snapshot = buildSnapshot(loadGermanPackFromDisk());
    const candoIds = new Set(snapshot.candos.map((cando) => cando.id));
    const itemIds = new Set(snapshot.items.map((item) => item.id));
    const lessons = snapshot.units.flatMap((unit) => unit.lessons);
    const exercises = lessons.flatMap((lesson) => lesson.exercises);

    expect(exercises.length).toBeGreaterThan(0);
    for (const lesson of lessons) {
      expect(lesson.candoIds.length).toBeGreaterThan(0);
      for (const id of lesson.candoIds) expect(candoIds.has(id)).toBe(true);
    }
    for (const exercise of exercises) {
      expect(exercise.candoIds.length).toBeGreaterThan(0);
      for (const id of exercise.candoIds) expect(candoIds.has(id)).toBe(true);
      for (const id of exercise.itemIds) expect(itemIds.has(id)).toBe(true);
    }
  });

  it('keeps lessons and exercises in ordinal order and stamps the pack version', () => {
    const pack = loadGermanPackFromDisk();
    const snapshot = buildSnapshot(pack);
    const ascending = (values: number[]) =>
      values.every((v, i) => i === 0 || v > (values[i - 1] ?? 0));

    expect(snapshot.version).toBe(pack.version);
    for (const unit of snapshot.units) {
      expect(unit.packVersion).toBe(pack.version);
      expect(ascending(unit.lessons.map((lesson) => lesson.ordinal))).toBe(true);
      for (const lesson of unit.lessons) {
        expect(lesson.unitId).toBe(unit.id);
        expect(ascending(lesson.exercises.map((exercise) => exercise.ordinal))).toBe(true);
        for (const exercise of lesson.exercises) expect(exercise.lessonId).toBe(lesson.id);
      }
    }
  });
  it('keeps the instruction of every exercise that has one', () => {
    const pack = loadGermanPackFromDisk();
    const snapshot = buildSnapshot(pack);
    const built = new Map(
      snapshot.units
        .flatMap((unit) => unit.lessons)
        .flatMap((lesson) => lesson.exercises)
        .map((exercise) => [exercise.id, exercise]),
    );
    let withInstruction = 0;

    for (const unit of pack.loadUnits()) {
      for (const lesson of unit.lessons) {
        for (const exercise of lesson.exercises) {
          const found = built.get(stableId(`${lesson.key}#${exercise.key}`));
          expect(found?.instructionEn).toBe(exercise.instruction_en ?? null);
          expect(found?.instructionNative).toBe(exercise.instruction_native ?? null);
          if (exercise.instruction_en !== undefined) withInstruction += 1;
        }
      }
    }
    // The pack does carry instructions, so the loop above compared real text.
    expect(withInstruction).toBeGreaterThan(0);
  });

  it('resolves the items lesson 1 introduces to items in the snapshot', () => {
    const pack = loadGermanPackFromDisk();
    const snapshot = buildSnapshot(pack);
    const itemsById = new Map(snapshot.items.map((item) => [item.id, item]));
    const source = pack
      .loadUnits()
      .flatMap((unit) => unit.lessons)
      .find((lesson) => lesson.key === 'de:lesson:a1-01-01');
    const lesson = snapshot.units
      .flatMap((unit) => unit.lessons)
      .find((candidate) => candidate.id === stableId('de:lesson:a1-01-01'));
    if (!source || !lesson) throw new Error('content/de has no lesson de:lesson:a1-01-01');
    const introduced = lesson.introducesItemIds ?? [];

    expect(introduced.length).toBeGreaterThan(0);
    // Same keys, same order, and every id is an item of this snapshot.
    expect(introduced.map((id) => itemsById.get(id)?.key)).toEqual(source.introduces_item_ids);
  });

  it('carries English titles and descriptions for every unit and lesson', () => {
    const pack = loadGermanPackFromDisk();
    const snapshot = buildSnapshot(pack);
    const itemIds = new Set(snapshot.items.map((item) => item.id));

    for (const unit of pack.loadUnits()) {
      const builtUnit = snapshot.units.find((candidate) => candidate.id === stableId(unit.key));
      expect(builtUnit?.titleEn).toBe(unit.title_en);
      for (const lesson of unit.lessons) {
        const built = builtUnit?.lessons.find((candidate) => candidate.id === stableId(lesson.key));
        expect(built?.titleEn).toBe(lesson.title_en);
        expect(built?.description).toBe(lesson.description ?? null);
        expect(built?.introducesItemIds).toHaveLength(lesson.introduces_item_ids?.length ?? 0);
        for (const id of built?.introducesItemIds ?? []) expect(itemIds.has(id)).toBe(true);
      }
    }
  });
});
