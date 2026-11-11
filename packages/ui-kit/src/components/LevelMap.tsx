'use client';

import { createElement, useId, useState } from 'react';
import type { CefrLevel } from '@stufen/contracts';
import { Button } from './Button';
import { cx } from './cx';
import { LevelBadge } from './LevelBadge';
import { Progress } from './Progress';

export type LevelMapStatus = 'reached' | 'working_towards' | 'not_started';
export type LevelMapCheckpoint = 'locked' | 'available' | 'passed' | 'failed';

export interface LevelMapDescriptor {
  id: string;
  /** Short code, for example `B1.REA.01`. */
  code: string;
  text: string;
  skill: string;
  mastered: boolean;
  /** Number of attempts that count as evidence. */
  evidenceCount: number;
  /** Exercise type ids with a correct attempt. */
  exerciseTypes: string[];
  /** Best score on a production task, out of 5. `null` when there is none. */
  bestProductionScore: number | null;
}

export interface LevelMapLevel {
  level: CefrLevel;
  status: LevelMapStatus;
  /** The official description of the level. */
  descriptorText?: string;
  masteredCount: number;
  totalCount: number;
  checkpoint: LevelMapCheckpoint;
  descriptors: LevelMapDescriptor[];
}

export interface LevelMapLabels {
  /** Accessible name of the whole ladder. Default "Level map". */
  map: string;
  reached: string;
  workingTowards: (level: CefrLevel) => string;
  notStarted: string;
  /** Default gives "12 of 61 mastered". */
  mastered: (mastered: number, total: number) => string;
  /** Name of the progress bar of a level. Default gives "B1 progress". */
  progress: (level: CefrLevel) => string;
  /** Lead of the official description. Default "What this level means". */
  official: string;
  /** Caption of the evidence table. Default gives "Evidence for B1". */
  evidence: (level: CefrLevel) => string;
  /** Shown when a level has no descriptors. */
  noDescriptors: string;
  columnDescriptor: string;
  columnSkill: string;
  columnState: string;
  columnAttempts: string;
  columnTypes: string;
  columnBestScore: string;
  descriptorMastered: string;
  descriptorInProgress: string;
  descriptorNotStarted: string;
  /** Default gives "9 attempts". */
  attempts: (count: number) => string;
  /** Shown when no exercise type has a correct attempt. Default "None yet". */
  noTypes: string;
  /** Default gives "best 2 of 5". */
  bestScore: (score: number) => string;
  /** Shown when there is no production score. Default "None". */
  noBestScore: string;
  /** Names for exercise type ids and skills. Unknown ids are shown with spaces for underscores. */
  names: Record<string, string>;
  takeCheckpoint: (level: CefrLevel) => string;
  checkpointLocked: string;
  checkpointPassed: string;
  checkpointFailed: string;
}

export interface LevelMapProps {
  levels: readonly LevelMapLevel[];
  /** Called when the checkpoint button of a level is pressed. */
  onStartCheckpoint?: (level: CefrLevel) => void;
  labels?: Partial<LevelMapLabels>;
  /** Levels that start open. Default: the levels being worked towards. */
  defaultExpanded?: readonly CefrLevel[];
  /** `ascending` lists A1 first, `descending` lists C2 first. Default `ascending`. */
  order?: 'ascending' | 'descending';
  /** Heading level of each row. Default 3. */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
  /** BCP 47 tag of the descriptor texts, when they are in the target language. */
  lang?: string;
  className?: string;
}

const LADDER: readonly CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const DEFAULT_LABELS: LevelMapLabels = {
  map: 'Level map',
  reached: 'Reached',
  workingTowards: (level) => `Working towards ${level}`,
  notStarted: 'Not started',
  mastered: (mastered, total) => `${mastered} of ${total} mastered`,
  progress: (level) => `${level} progress`,
  official: 'What this level means',
  evidence: (level) => `Evidence for ${level}`,
  noDescriptors: 'No can do statements for this level yet.',
  columnDescriptor: 'Can do',
  columnSkill: 'Skill',
  columnState: 'State',
  columnAttempts: 'Attempts',
  columnTypes: 'Exercise types',
  columnBestScore: 'Best production score',
  descriptorMastered: 'Mastered',
  descriptorInProgress: 'In progress',
  descriptorNotStarted: 'Not started',
  attempts: (count) => (count === 1 ? '1 attempt' : `${count} attempts`),
  noTypes: 'None yet',
  bestScore: (score) => `best ${score} of 5`,
  noBestScore: 'None',
  names: {},
  takeCheckpoint: (level) => `Take ${level} checkpoint`,
  checkpointLocked: 'The checkpoint is not open yet.',
  checkpointPassed: 'Checkpoint passed.',
  checkpointFailed: 'Checkpoint not passed.',
};

const TONES = { reached: 'success', working_towards: 'accent', not_started: 'neutral' } as const;

function statusWord(level: LevelMapLevel, labels: LevelMapLabels): string {
  if (level.status === 'reached') return labels.reached;
  return level.status === 'working_towards'
    ? labels.workingTowards(level.level)
    : labels.notStarted;
}

function descriptorState(descriptor: LevelMapDescriptor, labels: LevelMapLabels): string {
  if (descriptor.mastered) return labels.descriptorMastered;
  return descriptor.evidenceCount > 0 ? labels.descriptorInProgress : labels.descriptorNotStarted;
}

function checkpointWord(checkpoint: LevelMapCheckpoint, labels: LevelMapLabels): string | null {
  if (checkpoint === 'locked') return labels.checkpointLocked;
  if (checkpoint === 'passed') return labels.checkpointPassed;
  return checkpoint === 'failed' ? labels.checkpointFailed : null;
}

function EvidenceTable({
  level,
  labels,
  lang,
}: {
  level: LevelMapLevel;
  labels: LevelMapLabels;
  lang: string | undefined;
}) {
  const name = (id: string): string => labels.names[id] ?? id.replace(/_/g, ' ');
  return (
    <table className="st-level-map__table">
      <caption className="st-level-map__caption">{labels.evidence(level.level)}</caption>
      <thead>
        <tr>
          <th scope="col">{labels.columnDescriptor}</th>
          <th scope="col">{labels.columnSkill}</th>
          <th scope="col">{labels.columnState}</th>
          <th scope="col">{labels.columnAttempts}</th>
          <th scope="col">{labels.columnTypes}</th>
          <th scope="col">{labels.columnBestScore}</th>
        </tr>
      </thead>
      <tbody>
        {level.descriptors.map((descriptor) => (
          <tr key={descriptor.id} data-mastered={descriptor.mastered}>
            <th scope="row" className="st-level-map__descriptor">
              <span className="st-level-map__code">{descriptor.code}</span>{' '}
              <span lang={lang}>{descriptor.text}</span>
            </th>
            <td>{name(descriptor.skill)}</td>
            <td>
              {descriptor.mastered ? <span aria-hidden="true">✓ </span> : null}
              {descriptorState(descriptor, labels)}
            </td>
            <td>{labels.attempts(descriptor.evidenceCount)}</td>
            <td>
              {descriptor.exerciseTypes.length === 0
                ? labels.noTypes
                : descriptor.exerciseTypes.map(name).join(', ')}
            </td>
            <td>
              {descriptor.bestProductionScore === null
                ? labels.noBestScore
                : labels.bestScore(descriptor.bestProductionScore)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The ladder of CEFR levels. Each level opens to show what the level means
 * beside the evidence the learner has for each can do statement.
 */
export function LevelMap({
  levels,
  onStartCheckpoint,
  labels,
  defaultExpanded,
  order = 'ascending',
  headingLevel = 3,
  lang,
  className,
}: LevelMapProps) {
  const baseId = useId();
  const words = { ...DEFAULT_LABELS, ...labels };
  const [expanded, setExpanded] = useState<readonly CefrLevel[]>(
    () =>
      defaultExpanded ??
      levels.filter((level) => level.status === 'working_towards').map((level) => level.level),
  );

  const ascending = LADDER.flatMap((step) => levels.filter((level) => level.level === step));
  const ordered = order === 'ascending' ? ascending : [...ascending].reverse();

  function toggle(level: CefrLevel): void {
    setExpanded((open) =>
      open.includes(level) ? open.filter((entry) => entry !== level) : [...open, level],
    );
  }

  return (
    <ol className={cx('st-level-map', className)} aria-label={words.map}>
      {ordered.map((level) => {
        const open = expanded.includes(level.level);
        const panelId = `${baseId}-${level.level}`;
        const checkpointNote = checkpointWord(level.checkpoint, words);
        const description = level.descriptorText ?? '';
        const toggleButton = (
          <button
            type="button"
            className="st-level-map__toggle"
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            onClick={() => toggle(level.level)}
          >
            <LevelBadge level={level.level} tone={TONES[level.status]} />
            <span className="st-level-map__status">{statusWord(level, words)}</span>
            <span className="st-level-map__count">
              {words.mastered(level.masteredCount, level.totalCount)}
            </span>
            <span className="st-level-map__chevron" aria-hidden="true">
              {open ? '▾' : '▸'}
            </span>
          </button>
        );
        return (
          <li
            key={level.level}
            className="st-level-map__level"
            data-level={level.level}
            data-status={level.status}
          >
            {createElement(
              `h${headingLevel}`,
              { className: 'st-level-map__heading' },
              toggleButton,
            )}
            <Progress
              size="sm"
              value={level.masteredCount}
              max={level.totalCount}
              label={words.progress(level.level)}
              valueText={words.mastered(level.masteredCount, level.totalCount)}
            />
            {open ? (
              <div className="st-level-map__panel" id={panelId}>
                <div className="st-level-map__columns">
                  {description !== '' ? (
                    <div className="st-level-map__official">
                      <p className="st-level-map__official-lead">{words.official}</p>
                      <p className="st-level-map__official-text" lang={lang}>
                        {description}
                      </p>
                    </div>
                  ) : null}
                  {level.descriptors.length === 0 ? (
                    <p className="st-level-map__empty">{words.noDescriptors}</p>
                  ) : (
                    <div className="st-level-map__scroll">
                      <EvidenceTable level={level} labels={words} lang={lang} />
                    </div>
                  )}
                </div>
                <div className="st-level-map__checkpoint" data-checkpoint={level.checkpoint}>
                  {checkpointNote !== null ? (
                    <p className="st-level-map__checkpoint-note">{checkpointNote}</p>
                  ) : null}
                  {level.checkpoint === 'passed' ? null : (
                    <Button
                      variant="secondary"
                      disabled={level.checkpoint !== 'available'}
                      onClick={() => onStartCheckpoint?.(level.level)}
                    >
                      {words.takeCheckpoint(level.level)}
                    </Button>
                  )}
                </div>
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
