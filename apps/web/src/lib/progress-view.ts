// What the progress screen receives from the server. The level rows have the
// shape the ui-kit LevelMap takes. Plain data, shared by server and client.

import type { CefrLevel, LevelEstimateMethod } from '@stufen/contracts';
import type { LevelMapLevel } from '@stufen/ui-kit';

export interface ProgressView {
  /** The target language, as a BCP 47 tag. */
  language: string;
  /** The app's estimate, once a level is reached or an estimate is recorded. */
  estimate: { level: CefrLevel; confidence: number; method: LevelEstimateMethod } | null;
  /** The first level that is not reached. Null when all six are. */
  workingTowards: CefrLevel | null;
  /** True once any descriptor has evidence. */
  hasEvidence: boolean;
  /** Six rows, A1 first. */
  levels: LevelMapLevel[];
}

/** Words for the skill ids and exercise type ids the evidence table shows. */
export const EVIDENCE_NAMES: Record<string, string> = {
  reading: 'Reading',
  listening: 'Listening',
  spoken_production: 'Speaking',
  spoken_interaction: 'Conversation',
  writing: 'Writing',
  mediation: 'Mediation',
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
  multiple_choice: 'multiple choice',
  cloze: 'fill the gap',
  match_pairs: 'match pairs',
  order_words: 'word order',
  translate: 'translation',
  dictation: 'dictation',
  read_answer: 'reading questions',
  listen_answer: 'listening questions',
  write_free: 'free writing',
  speak_prompt: 'speaking',
  flashcard: 'flashcard',
};

const METHOD_WORDS: Record<LevelEstimateMethod, string> = {
  placement: 'from the placement test',
  checkpoint: 'from a checkpoint',
  mastery_ratio: 'from your evidence',
  manual: 'set by hand',
};

/** The header line. It says "estimated level" and never more than that. */
export function estimateLine(view: Pick<ProgressView, 'estimate' | 'workingTowards'>): string {
  const towards =
    view.workingTowards === null ? '' : ` You are working towards ${view.workingTowards}.`;
  if (view.estimate === null) return `No estimated level yet.${towards}`;
  return `Estimated level ${view.estimate.level}, ${METHOD_WORDS[view.estimate.method]}.${towards}`;
}
