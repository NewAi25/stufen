// The exercise type registry. One instance per app, created by apps/web.
// It holds definitions only. It does no grading itself.

import type { ExerciseTypeDefinition, ExerciseTypeId } from '@stufen/contracts';
import { UnknownExerciseTypeError } from './errors';

export interface ExerciseTypeRegistry {
  /** Adds a type. Throws when the id is already registered. */
  registerType(def: ExerciseTypeDefinition): void;
  /** Returns the definition. Throws UnknownExerciseTypeError when it is missing. */
  getType(id: ExerciseTypeId): ExerciseTypeDefinition;
  /** All registered definitions, in the order they were registered. */
  listTypes(): ExerciseTypeDefinition[];
  hasType(id: ExerciseTypeId): boolean;
}

export function createExerciseTypeRegistry(): ExerciseTypeRegistry {
  const types = new Map<string, ExerciseTypeDefinition>();

  return {
    registerType(def) {
      if (types.has(def.id)) {
        throw new Error(`Exercise type "${def.id}" is already registered.`);
      }
      types.set(def.id, def);
    },
    getType(id) {
      const def = types.get(id);
      if (!def) throw new UnknownExerciseTypeError(id);
      return def;
    },
    listTypes() {
      return [...types.values()];
    },
    hasType(id) {
      return types.has(id);
    },
  };
}
