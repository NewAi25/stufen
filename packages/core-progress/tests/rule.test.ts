// The pure rules of core-progress: the default mastery rule with each
// override, and the four conditions of "Level L is reached" from
// docs/04-module-contracts.md. No store, no bus, no clock.
import { describe, expect, it } from 'vitest';
import type { Cando, CandoMastery, CefrLevel, MasteryRule, Skill } from '@stufen/contracts';
import {
  DEFAULT_MASTERY_RULE,
  defaultProductionScore,
  effectiveRule,
  isMastered,
  levelConditions,
  levelStatus,
  recentAccuracy,
} from '../src/index';

function cando(
  id: string,
  skill: Skill,
  masteryRule: MasteryRule | null = null,
  level: CefrLevel = 'A1',
): Cando {
  return {
    id,
    languageCode: 'de',
    level,
    skill,
    code: `${level}.${id}`,
    textEn: `Can do ${id}`,
    textNative: null,
    source: 'cefr-cv-2020',
    masteryRule,
  };
}

/** A row that satisfies the default rule for any skill. Override to break one clause. */
function row(candoId: string, override: Partial<CandoMastery> = {}): CandoMastery {
  return {
    userId: 'user-1',
    candoId,
    evidenceCount: 6,
    correctCount: 6,
    exerciseTypesSeen: ['cloze', 'multiple_choice'],
    bestProductionScore: 3,
    recentAccuracy: 1,
    masteredAt: null,
    updatedAt: '2026-11-06T10:00:00.000Z',
    ...override,
  };
}

/** `correct` correct attempts followed by `wrong` wrong ones. */
function outcomes(correct: number, wrong: number): { correct: boolean }[] {
  return [
    ...Array.from({ length: correct }, () => ({ correct: true })),
    ...Array.from({ length: wrong }, () => ({ correct: false })),
  ];
}

const reading = cando('rea', 'reading');

describe('isMastered: the default rule', () => {
  it('has the numbers from docs/04 for A1 to B2', () => {
    expect(DEFAULT_MASTERY_RULE).toEqual({
      evidenceCount: 6,
      distinctExerciseTypes: 2,
      recentAccuracy: 0.8,
      bestProductionScore: 3,
    });
  });

  it('is true for six attempts, two correct types and full accuracy', () => {
    expect(isMastered(row('rea', { bestProductionScore: null }), reading, outcomes(6, 0))).toBe(
      true,
    );
  });

  it('clause 1: needs an evidence count of at least 6', () => {
    expect(isMastered(row('rea', { evidenceCount: 5 }), reading, outcomes(5, 0))).toBe(false);
    expect(isMastered(row('rea', { evidenceCount: 6 }), reading, outcomes(6, 0))).toBe(true);
  });

  it('clause 2: needs correct attempts in at least 2 distinct exercise types', () => {
    expect(isMastered(row('rea', { exerciseTypesSeen: ['cloze'] }), reading)).toBe(false);
    expect(isMastered(row('rea', { exerciseTypesSeen: ['cloze', 'cloze'] }), reading)).toBe(false);
    expect(isMastered(row('rea', { exerciseTypesSeen: ['cloze', 'dictation'] }), reading)).toBe(
      true,
    );
  });

  it('clause 3: needs an accuracy of at least 0.8 over the last 10 attempts', () => {
    const ten = row('rea', { evidenceCount: 10 });
    expect(isMastered(ten, reading, outcomes(8, 2))).toBe(true);
    expect(isMastered(ten, reading, outcomes(7, 3))).toBe(false);
  });

  it('clause 3: only the last 10 attempts count', () => {
    const many = row('rea', { evidenceCount: 15 });
    // Five early mistakes have left the window: the last ten are all correct.
    expect(isMastered(many, reading, [...outcomes(0, 5), ...outcomes(10, 0)])).toBe(true);
    // Ten early successes do not rescue three late mistakes in the window.
    expect(isMastered(many, reading, [...outcomes(12, 0), ...outcomes(0, 3)])).toBe(false);
  });

  it('clause 3: uses the accuracy stored on the row when no history is passed', () => {
    expect(isMastered(row('rea', { recentAccuracy: 0.8 }), reading)).toBe(true);
    expect(isMastered(row('rea', { recentAccuracy: 0.79 }), reading)).toBe(false);
    expect(isMastered(row('rea', { recentAccuracy: null }), reading)).toBe(false);
  });

  it.each(['writing', 'spoken_production', 'spoken_interaction'] as const)(
    'clause 4: %s needs a best production score of at least 3',
    (skill) => {
      const c = cando('prod', skill);
      expect(isMastered(row('prod', { bestProductionScore: null }), c)).toBe(false);
      expect(isMastered(row('prod', { bestProductionScore: 2 }), c)).toBe(false);
      expect(isMastered(row('prod', { bestProductionScore: 3 }), c)).toBe(true);
    },
  );

  it.each(['reading', 'listening', 'grammar', 'vocabulary', 'mediation'] as const)(
    'clause 4: %s needs no production score',
    (skill) => {
      expect(isMastered(row('x', { bestProductionScore: null }), cando('x', skill))).toBe(true);
    },
  );
});

describe('isMastered: the production score threshold defaults by level', () => {
  it('defaultProductionScore is 3 for A1 to B2 and 4 for C1 and C2', () => {
    expect((['A1', 'A2', 'B1', 'B2'] as const).map(defaultProductionScore)).toEqual([3, 3, 3, 3]);
    expect((['C1', 'C2'] as const).map(defaultProductionScore)).toEqual([4, 4]);
  });

  it('effectiveRule takes the default from the level of the descriptor', () => {
    expect(effectiveRule(cando('x', 'writing', null, 'B2')).bestProductionScore).toBe(3);
    expect(effectiveRule(cando('x', 'writing', null, 'C1')).bestProductionScore).toBe(4);
    expect(effectiveRule(cando('x', 'writing', null, 'C2')).bestProductionScore).toBe(4);
  });

  it('B2: a best production score of 3 passes', () => {
    const b2 = cando('wri', 'writing', null, 'B2');
    expect(isMastered(row('wri', { bestProductionScore: 2 }), b2)).toBe(false);
    expect(isMastered(row('wri', { bestProductionScore: 3 }), b2)).toBe(true);
  });

  it.each(['C1', 'C2'] as const)('%s: 3 fails and 4 passes', (level) => {
    const c = cando('wri', 'writing', null, level);
    expect(isMastered(row('wri', { bestProductionScore: null }), c)).toBe(false);
    expect(isMastered(row('wri', { bestProductionScore: 3 }), c)).toBe(false);
    expect(isMastered(row('wri', { bestProductionScore: 3.9 }), c)).toBe(false);
    expect(isMastered(row('wri', { bestProductionScore: 4 }), c)).toBe(true);
  });

  it.each(['spoken_production', 'spoken_interaction'] as const)(
    'C1: %s follows the same threshold',
    (skill) => {
      const c = cando('spk', skill, null, 'C1');
      expect(isMastered(row('spk', { bestProductionScore: 3 }), c)).toBe(false);
      expect(isMastered(row('spk', { bestProductionScore: 4 }), c)).toBe(true);
    },
  );

  it("a C1 descriptor's own masteryRule overrides the level default, down or up", () => {
    const lenient = cando('wri', 'writing', { bestProductionScore: 3 }, 'C1');
    expect(isMastered(row('wri', { bestProductionScore: 3 }), lenient)).toBe(true);
    const strict = cando('wri', 'writing', { bestProductionScore: 5 }, 'C1');
    expect(isMastered(row('wri', { bestProductionScore: 4 }), strict)).toBe(false);
    expect(isMastered(row('wri', { bestProductionScore: 5 }), strict)).toBe(true);
  });

  it('an override of another field on a C1 descriptor keeps the level default of 4', () => {
    const c = cando('wri', 'writing', { evidenceCount: 3 }, 'C1');
    expect(effectiveRule(c)).toEqual({
      ...DEFAULT_MASTERY_RULE,
      evidenceCount: 3,
      bestProductionScore: 4,
    });
    expect(isMastered(row('wri', { bestProductionScore: 3 }), c)).toBe(false);
  });

  it('a receptive C1 descriptor still needs no production score', () => {
    const c = cando('rea', 'reading', null, 'C1');
    expect(isMastered(row('rea', { bestProductionScore: null }), c)).toBe(true);
  });
});

describe('recentAccuracy', () => {
  it('is null without attempts and a share of the last ten otherwise', () => {
    expect(recentAccuracy([])).toBeNull();
    expect(recentAccuracy(outcomes(3, 1))).toBe(0.75);
    expect(recentAccuracy([...outcomes(0, 4), ...outcomes(9, 1)])).toBe(0.9);
  });
});

describe('isMastered: a descriptor overrides the rule field by field', () => {
  it('effectiveRule keeps the defaults for the fields the descriptor leaves out', () => {
    expect(effectiveRule(cando('x', 'reading'))).toEqual(DEFAULT_MASTERY_RULE);
    expect(effectiveRule(cando('x', 'reading', { evidenceCount: 3 }))).toEqual({
      ...DEFAULT_MASTERY_RULE,
      evidenceCount: 3,
    });
  });

  it('evidenceCount: a higher number is demanded, a lower one is enough', () => {
    const strict = cando('x', 'reading', { evidenceCount: 8 });
    expect(isMastered(row('x', { evidenceCount: 7 }), strict)).toBe(false);
    expect(isMastered(row('x', { evidenceCount: 8 }), strict)).toBe(true);
    const lenient = cando('x', 'reading', { evidenceCount: 3 });
    expect(isMastered(row('x', { evidenceCount: 3 }), lenient)).toBe(true);
  });

  it('distinctExerciseTypes: 3 demanded, or 1 enough', () => {
    const strict = cando('x', 'reading', { distinctExerciseTypes: 3 });
    expect(isMastered(row('x'), strict)).toBe(false);
    expect(
      isMastered(row('x', { exerciseTypesSeen: ['cloze', 'dictation', 'translate'] }), strict),
    ).toBe(true);
    const lenient = cando('x', 'reading', { distinctExerciseTypes: 1 });
    expect(isMastered(row('x', { exerciseTypesSeen: ['cloze'] }), lenient)).toBe(true);
  });

  it('recentAccuracy: 0.9 demanded, or 0.5 enough', () => {
    const ten = row('x', { evidenceCount: 10 });
    const strict = cando('x', 'reading', { recentAccuracy: 0.9 });
    expect(isMastered(ten, strict, outcomes(8, 2))).toBe(false);
    expect(isMastered(ten, strict, outcomes(9, 1))).toBe(true);
    const lenient = cando('x', 'reading', { recentAccuracy: 0.5 });
    expect(isMastered(ten, lenient, outcomes(5, 5))).toBe(true);
  });

  it('bestProductionScore: 4 of 5 demanded for a writing descriptor', () => {
    const strict = cando('x', 'writing', { bestProductionScore: 4 });
    expect(isMastered(row('x', { bestProductionScore: 3 }), strict)).toBe(false);
    expect(isMastered(row('x', { bestProductionScore: 4 }), strict)).toBe(true);
  });

  it('bestProductionScore: a production descriptor always needs a graded sample', () => {
    const lenient = cando('x', 'writing', { bestProductionScore: 0 });
    expect(isMastered(row('x', { bestProductionScore: null }), lenient)).toBe(false);
    expect(isMastered(row('x', { bestProductionScore: 0 }), lenient)).toBe(true);
  });

  it('bestProductionScore on a receptive descriptor is ignored', () => {
    const odd = cando('x', 'listening', { bestProductionScore: 4 });
    expect(isMastered(row('x', { bestProductionScore: null }), odd)).toBe(true);
  });

  it('one override does not loosen the other clauses', () => {
    const c = cando('x', 'writing', { evidenceCount: 2 });
    const two = { evidenceCount: 2 };
    expect(isMastered(row('x', { ...two, exerciseTypesSeen: ['cloze'] }), c)).toBe(false);
    expect(isMastered(row('x', { ...two, bestProductionScore: 2 }), c)).toBe(false);
    expect(isMastered(row('x', two), c)).toBe(true);
  });
});

// A level of five descriptors: three receptive or scaffolding, two production.
const level: Cando[] = [
  cando('rea', 'reading'),
  cando('lis', 'listening'),
  cando('gra', 'grammar'),
  cando('wri', 'writing'),
  cando('spi', 'spoken_interaction'),
];
const MASTERED = '2026-11-06T09:00:00.000Z';
const done = (id: string): CandoMastery => row(id, { masteredAt: MASTERED });
/** A receptive row has no graded sample. */
const doneReceptive = (id: string): CandoMastery =>
  row(id, { masteredAt: MASTERED, bestProductionScore: null });
const allDone = [
  doneReceptive('rea'),
  doneReceptive('lis'),
  doneReceptive('gra'),
  done('wri'),
  done('spi'),
];

describe('levelStatus: the four conditions of "Level L is reached"', () => {
  it('is reached when all four conditions hold', () => {
    expect(levelStatus(level, allDone, true)).toBe('reached');
    expect(levelConditions(level, allDone, true)).toEqual({
      ratioMet: true,
      productionMastered: true,
      checkpointPassed: true,
      productionEvidence: true,
      masteredCount: 5,
      totalCount: 5,
      anyEvidence: true,
    });
  });

  it('is reached at exactly 80 percent when the unmastered descriptor is receptive', () => {
    const rows = [doneReceptive('rea'), doneReceptive('lis'), done('wri'), done('spi')];
    expect(levelStatus(level, rows, true)).toBe('reached');
  });

  it('condition 1: under 80 percent mastered is working_towards', () => {
    // 3 of 5 is 60 percent. Both production descriptors are mastered.
    const rows = [doneReceptive('rea'), done('wri'), done('spi')];
    expect(levelConditions(level, rows, true)).toMatchObject({
      ratioMet: false,
      productionMastered: true,
    });
    expect(levelStatus(level, rows, true)).toBe('working_towards');
  });

  it('condition 1: 36 of 45 is 80 percent, 35 of 45 is not', () => {
    const big = Array.from({ length: 45 }, (_, i) => cando(`c${i}`, 'reading'));
    const rows = (n: number) => big.slice(0, n).map((c) => doneReceptive(c.id));
    expect(levelConditions(big, rows(36), true).ratioMet).toBe(true);
    expect(levelConditions(big, rows(35), true).ratioMet).toBe(false);
  });

  it('condition 2: all receptive descriptors mastered, one production descriptor not', () => {
    // 4 of 5 is 80 percent, so only condition 2 fails.
    const rows = [doneReceptive('rea'), doneReceptive('lis'), doneReceptive('gra'), done('wri')];
    expect(levelConditions(level, rows, true)).toMatchObject({
      ratioMet: true,
      productionMastered: false,
      checkpointPassed: true,
    });
    expect(levelStatus(level, rows, true)).toBe('working_towards');
  });

  it('condition 3: everything mastered but no checkpoint is working_towards', () => {
    expect(levelStatus(level, allDone, false)).toBe('working_towards');
  });

  it('condition 4: receptive and scaffolding evidence alone never reaches a level', () => {
    const receptiveOnly = [
      cando('rea', 'reading'),
      cando('gra', 'grammar'),
      cando('voc', 'vocabulary'),
    ];
    const rows = [doneReceptive('rea'), doneReceptive('gra'), doneReceptive('voc')];
    // Conditions 1, 2 and 3 all hold here. Only condition 4 stops the level.
    expect(levelConditions(receptiveOnly, rows, true)).toMatchObject({
      ratioMet: true,
      productionMastered: true,
      checkpointPassed: true,
      productionEvidence: false,
    });
    expect(levelStatus(receptiveOnly, rows, true)).toBe('working_towards');
  });

  it('condition 4: a production descriptor marked mastered without a graded sample does not count', () => {
    const rows = ['rea', 'lis', 'gra', 'wri', 'spi'].map(doneReceptive);
    expect(levelStatus(level, rows, true)).toBe('working_towards');
  });

  it('is not_started without evidence and working_towards from the first attempt', () => {
    expect(levelStatus(level, [], false)).toBe('not_started');
    expect(levelStatus([], [], false)).toBe('not_started');
    const first = row('rea', {
      evidenceCount: 1,
      correctCount: 0,
      exerciseTypesSeen: [],
      bestProductionScore: null,
    });
    expect(levelStatus(level, [first], false)).toBe('working_towards');
  });

  it('ignores rows of other levels and counts a repeated descriptor once', () => {
    expect(levelStatus(level, [done('other-level')], false)).toBe('not_started');
    const c = levelConditions([...level, cando('rea', 'reading')], allDone, true);
    expect(c).toMatchObject({ masteredCount: 5, totalCount: 5 });
  });
});
