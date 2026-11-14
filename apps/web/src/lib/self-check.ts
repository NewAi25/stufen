// Reads the payload of a translate, write_free or speak_prompt exercise into
// the few fields the self check screen shows. The payload shapes are the ones
// in content/schema/exercise.schema.json. A field that is missing or has the
// wrong type is left out, never thrown about.

import type { SelfCheckContent, SelfCheckType } from './lesson-view';

type Json = Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function wordRange(payload: Json): string | null {
  const min = payload.min_words;
  const max = payload.max_words;
  if (typeof min !== 'number') return null;
  return typeof max === 'number' ? `Write ${min} to ${max} words.` : `Write at least ${min} words.`;
}

export function selfCheckContent(type: SelfCheckType, payload: unknown): SelfCheckContent {
  const data: Json = typeof payload === 'object' && payload !== null ? (payload as Json) : {};

  if (type === 'translate') {
    const toEnglish = data.direction === 'to_en';
    const references = Array.isArray(data.reference) ? data.reference : [];
    return {
      type,
      prompt: text(data.source_text) ?? '',
      promptInTarget: toEnglish,
      promptNative: null,
      sample: text(references[0]),
      sampleInTarget: !toEnglish,
      targetText: null,
      note: text(data.notes_en),
    };
  }

  const targetText = type === 'speak_prompt' ? text(data.target_text) : null;
  return {
    type,
    prompt: text(data.prompt_en) ?? '',
    promptInTarget: false,
    promptNative: text(data.prompt_native),
    sample: text(data.sample_answer) ?? targetText,
    sampleInTarget: true,
    targetText,
    note: type === 'write_free' ? wordRange(data) : null,
  };
}
