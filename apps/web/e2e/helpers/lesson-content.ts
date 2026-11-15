// Reads a lesson of the German pack from content/de at test time, so the test
// knows the type and the payload of each exercise in order. Nothing is copied
// into the test: when the lesson changes, the test follows.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface LessonExercise {
  ordinal: number;
  type: string;
  instruction: string | null;
  payload: Record<string, unknown>;
}

export interface LessonContent {
  title: string;
  /** How many items the lesson introduces. They become review cards. */
  introducedItems: number;
  /** In the order the lesson player shows them. */
  exercises: LessonExercise[];
}

/** The types that are saved as a self check until the tutor grades them. */
export const SELF_CHECK_TYPES: readonly string[] = ['translate', 'write_free', 'speak_prompt'];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function textOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** The folder that holds the language folders: STUFEN_CONTENT_DIR, or content/ in the repo. */
function contentDir(): string {
  const fromEnv = process.env.STUFEN_CONTENT_DIR ?? '';
  if (fromEnv !== '') return fromEnv;
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../../../../content');
}

function exerciseOf(entry: unknown, file: string): LessonExercise {
  if (!isRecord(entry) || typeof entry.type !== 'string' || typeof entry.ordinal !== 'number') {
    throw new Error(`An exercise in ${file} has no type or no ordinal.`);
  }
  return {
    ordinal: entry.ordinal,
    type: entry.type,
    instruction: textOf(entry.instruction_en),
    payload: isRecord(entry.payload) ? entry.payload : {},
  };
}

/** Reads one lesson file, for example `de/units/A1/01-hallo/lesson-01.json`. */
export function readLesson(relativePath: string): LessonContent {
  const file = path.join(contentDir(), relativePath);
  const data: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!isRecord(data)) throw new Error(`${file} is not a lesson object.`);
  const title = textOf(data.title);
  if (title === null) throw new Error(`${file} has no title.`);
  const exercises = listOf(data.exercises)
    .map((entry) => exerciseOf(entry, file))
    .sort((a, b) => a.ordinal - b.ordinal);
  if (exercises.length === 0) throw new Error(`${file} has no exercises.`);
  return { title, introducedItems: listOf(data.introduces_item_ids).length, exercises };
}
