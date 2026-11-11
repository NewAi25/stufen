import { describe, expect, it } from 'vitest';
import type { ExerciseTypeDefinition, ExerciseTypeId } from '@stufen/contracts';
import {
  UnknownExerciseTypeError,
  createExerciseTypeRegistry,
  registerDeterministicTypes,
} from '../src/index';

function fakeType(id: ExerciseTypeId): ExerciseTypeDefinition {
  return {
    id,
    skill: ['vocabulary'],
    payloadSchema: { type: 'object' },
    needsAi: false,
    rendererKey: id,
    grade: async () => ({ correct: true, score: 1, feedback: { message: 'Correct.' } }),
  };
}

describe('exercise type registry', () => {
  it('starts empty', () => {
    const registry = createExerciseTypeRegistry();
    expect(registry.listTypes()).toEqual([]);
    expect(registry.hasType('cloze')).toBe(false);
  });

  it('returns a registered type', () => {
    const registry = createExerciseTypeRegistry();
    const cloze = fakeType('cloze');
    registry.registerType(cloze);
    expect(registry.hasType('cloze')).toBe(true);
    expect(registry.getType('cloze')).toBe(cloze);
  });

  it('lists types in registration order', () => {
    const registry = createExerciseTypeRegistry();
    registry.registerType(fakeType('flashcard'));
    registry.registerType(fakeType('cloze'));
    expect(registry.listTypes().map((def) => def.id)).toEqual(['flashcard', 'cloze']);
  });

  it('throws a typed error for an unknown type', () => {
    const registry = createExerciseTypeRegistry();
    expect(() => registry.getType('translate')).toThrow(UnknownExerciseTypeError);
    try {
      registry.getType('translate');
    } catch (error) {
      expect(error).toBeInstanceOf(UnknownExerciseTypeError);
      expect((error as UnknownExerciseTypeError).exerciseType).toBe('translate');
      expect((error as UnknownExerciseTypeError).code).toBe('unknown_exercise_type');
    }
  });

  it('refuses to register the same id twice', () => {
    const registry = createExerciseTypeRegistry();
    registry.registerType(fakeType('cloze'));
    expect(() => registry.registerType(fakeType('cloze'))).toThrow(/already registered/);
  });

  it('keeps two registries apart', () => {
    const first = createExerciseTypeRegistry();
    const second = createExerciseTypeRegistry();
    first.registerType(fakeType('cloze'));
    expect(second.hasType('cloze')).toBe(false);
  });
});

describe('registerDeterministicTypes', () => {
  const eight = [
    'multiple_choice',
    'cloze',
    'match_pairs',
    'order_words',
    'flashcard',
    'read_answer',
    'listen_answer',
    'dictation',
  ];

  it('registers exactly the eight deterministic types', () => {
    const registry = createExerciseTypeRegistry();
    registerDeterministicTypes(registry);
    expect(registry.listTypes().map((def) => def.id)).toEqual(eight);
  });

  it('registers nothing for the AI graded types', () => {
    const registry = createExerciseTypeRegistry();
    registerDeterministicTypes(registry);
    for (const id of ['translate', 'write_free', 'speak_prompt'] as const) {
      expect(registry.hasType(id)).toBe(false);
      expect(() => registry.getType(id)).toThrow(UnknownExerciseTypeError);
    }
  });

  it('gives every type needsAi false, a rendererKey equal to its id and a payload schema', () => {
    const registry = createExerciseTypeRegistry();
    registerDeterministicTypes(registry);
    for (const def of registry.listTypes()) {
      expect(def.needsAi).toBe(false);
      expect(def.rendererKey).toBe(def.id);
      expect(def.payloadSchema.type).toBe('object');
      expect(def.skill.length).toBeGreaterThan(0);
    }
  });

  it('throws when called twice on the same registry', () => {
    const registry = createExerciseTypeRegistry();
    registerDeterministicTypes(registry);
    expect(() => registerDeterministicTypes(registry)).toThrow(/already registered/);
  });
});
