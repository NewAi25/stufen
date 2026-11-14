import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CEFR_LEVELS } from '@stufen/contracts';
import { loadProgress } from '../src/server/actions/progress-actions';
import { createContainer } from '../src/server/container';
import { LEVEL_DESCRIPTIONS, NOT_A_CERTIFICATE } from '../src/lib/level-descriptions';
import { estimateLine } from '../src/lib/progress-view';
import { memoryConfig } from './helpers/config';
import { finishWholeLesson, firstLesson } from './helpers/finish-lesson';

// The data behind /progress, on the real container with in memory stores.

async function setup() {
  const container = createContainer(memoryConfig());
  const session = await container.auth.createDevSession('learner@stufen.local');
  const lesson = await firstLesson(container);
  return { container, userId: session.userId, lesson };
}

describe('loadProgress', () => {
  it('shows a new learner six levels with every descriptor at zero evidence', async () => {
    const { container, userId } = await setup();
    const view = await loadProgress(container, userId, 'de');

    expect(view.levels.map((row) => row.level)).toEqual([...CEFR_LEVELS]);
    expect(view.estimate).toBeNull();
    expect(view.hasEvidence).toBe(false);
    expect(view.workingTowards).toBe(CEFR_LEVELS[0]);
    for (const row of view.levels) {
      const candos = await container.curriculum.listCandos('de', row.level);
      expect(row.totalCount).toBe(candos.length);
      expect(row.descriptors.map((entry) => entry.code)).toEqual(candos.map((c) => c.code));
      expect(row.masteredCount).toBe(0);
      expect(row.status).toBe('not_started');
      expect(row.checkpoint).toBe('locked');
      expect(row.descriptorText).toBe(`${LEVEL_DESCRIPTIONS[row.level]} ${NOT_A_CERTIFICATE}`);
      for (const entry of row.descriptors) {
        expect(entry).toMatchObject({
          mastered: false,
          evidenceCount: 0,
          exerciseTypes: [],
          bestProductionScore: null,
        });
      }
    }
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });

  it('shows evidence for a descriptor after the first lesson, from checked work only', async () => {
    const { container, userId, lesson } = await setup();
    await finishWholeLesson(container, userId, lesson);
    const view = await loadProgress(container, userId, 'de');
    expect(view.hasEvidence).toBe(true);

    // What the raw lesson says each checked exercise targets.
    const raw = await container.curriculum.getLesson(lesson.id);
    const checked = raw.exercises.filter((entry) => container.exerciseTypes.hasType(entry.type));
    const descriptors = view.levels.flatMap((row) => row.descriptors);
    const withEvidence = descriptors.filter((entry) => entry.evidenceCount > 0);
    expect(withEvidence.length).toBeGreaterThan(0);
    expect(new Set(withEvidence.map((entry) => entry.id))).toEqual(
      new Set(checked.flatMap((entry) => entry.candoIds)),
    );
    for (const entry of withEvidence) {
      const from = checked.filter((exercise) => exercise.candoIds.includes(entry.id));
      expect(entry.evidenceCount, entry.code).toBe(from.length);
      expect(new Set(entry.exerciseTypes)).toEqual(new Set(from.map((exercise) => exercise.type)));
      // A self check gives no production score, so nothing is graded yet.
      expect(entry.bestProductionScore).toBeNull();
    }

    // One lesson reaches nothing, and the checkpoint is never open.
    const level = view.levels.find((row) => row.descriptors.some((d) => d.evidenceCount > 0));
    expect(level?.status).toBe('working_towards');
    expect(view.levels.every((row) => row.status !== 'reached')).toBe(true);
    expect(view.levels.every((row) => row.checkpoint === 'locked')).toBe(true);
    expect(view.estimate).toBeNull();
    expect(view.workingTowards).toBe(CEFR_LEVELS[0]);
  });

  it('shows a passed checkpoint as passed and opens no other', async () => {
    const { container, userId } = await setup();
    await container.progress.recordEstimate(userId, 'de', 'A1', 0.8, 'checkpoint');
    const view = await loadProgress(container, userId, 'de');
    const [a1, ...rest] = view.levels;
    expect(a1?.checkpoint).toBe('passed');
    // The checkpoint alone reaches nothing: there is no evidence behind it.
    expect(a1?.status).not.toBe('reached');
    expect(rest.every((row) => row.checkpoint === 'locked')).toBe(true);
    expect(view.estimate).toMatchObject({ level: 'A1', method: 'checkpoint' });
    expect(estimateLine(view)).toMatch(/^Estimated level A1, from a checkpoint\./);
  });
});

describe('the level descriptions', () => {
  it('are the global scale paragraphs of docs/14, word for word', () => {
    const doc = readFileSync(
      fileURLToPath(new URL('../../../docs/14-levels-in-real-life.md', import.meta.url)),
      'utf8',
    ).replace(/\r\n/g, '\n');
    for (const level of CEFR_LEVELS) {
      const section = doc.split(`\n### ${level}\n`)[1] ?? '';
      const paragraph = /\*\*Global scale \(S2\)\.\*\* (.+)/.exec(section)?.[1];
      expect(LEVEL_DESCRIPTIONS[level], level).toBe(paragraph?.trim());
    }
  });

  it('never call the estimate a certificate', () => {
    expect(NOT_A_CERTIFICATE).toMatch(/estimate/);
    expect(NOT_A_CERTIFICATE).toMatch(/not a certificate/);
    expect(estimateLine({ estimate: null, workingTowards: 'A1' })).toBe(
      'No estimated level yet. You are working towards A1.',
    );
  });
});
