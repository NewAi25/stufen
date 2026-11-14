import 'server-only';

// What the progress screen shows (row P1-23), kept free of Next so it can be
// tested with a real container. Boxes used: progress, which reads the
// descriptors of the curriculum through the composition root.

import type { LanguageCode } from '@stufen/contracts';
import type { LevelMapLevel } from '@stufen/ui-kit';
import { LEVEL_DESCRIPTIONS, NOT_A_CERTIFICATE } from '../../lib/level-descriptions';
import type { ProgressView } from '../../lib/progress-view';
import type { Container } from '../container';

/** The level map of one learner, in the shape the ui-kit LevelMap takes. */
export async function loadProgress(
  container: Container,
  userId: string,
  language: LanguageCode,
): Promise<ProgressView> {
  await container.ready;
  const map = await container.progress.levelMap(userId, language);

  const levels: LevelMapLevel[] = map.levels.map((row) => ({
    level: row.level,
    status: row.status,
    descriptorText: `${LEVEL_DESCRIPTIONS[row.level]} ${NOT_A_CERTIFICATE}`,
    masteredCount: row.masteredCount,
    totalCount: row.totalCount,
    // Checkpoints need core-assessment, which is not wired. Until then the
    // button is never open, whatever the mastered share is.
    checkpoint: row.checkpoint === 'passed' ? 'passed' : 'locked',
    descriptors: row.descriptors.map(({ cando, mastery }) => ({
      id: cando.id,
      code: cando.code,
      text: cando.textEn,
      skill: cando.skill,
      mastered: mastery !== null && mastery.masteredAt !== null,
      evidenceCount: mastery?.evidenceCount ?? 0,
      exerciseTypes: [...(mastery?.exerciseTypesSeen ?? [])],
      bestProductionScore: mastery?.bestProductionScore ?? null,
    })),
  }));

  return {
    language,
    estimate:
      map.estimate === null
        ? null
        : {
            level: map.estimate.level,
            confidence: map.estimate.confidence,
            method: map.estimate.method,
          },
    workingTowards: map.levels.find((row) => row.status !== 'reached')?.level ?? null,
    hasEvidence: map.levels.some((row) => row.candos.length > 0),
    levels,
  };
}
