// What the review screen receives from the server, and how an item of the
// content pack becomes a card. Plain data, shared by server and client code.
// The item payload shapes are the ones in content/schema/item.schema.json.

import type { Item } from '@stufen/contracts';

export interface ReviewExample {
  text: string;
  glossEn: string;
}

/** One due card with what both of its sides show. */
export interface ReviewCardView {
  itemId: string;
  /** The German side. Nouns carry their article. */
  lemma: string;
  /** The meaning in English. */
  gloss: string;
  example: ReviewExample | null;
  /** Nouns only. */
  gender: 'masculine' | 'feminine' | 'neuter' | null;
  /** Nouns only. The plural form with its article. Null when there is none. */
  plural: string | null;
}

export interface ReviewQueueView {
  /** The target language, as a BCP 47 tag for `lang`. */
  language: string;
  /** The first cards of the queue, oldest due date first. */
  cards: ReviewCardView[];
  /** Every card that is due now, also those beyond `cards`. */
  due: number;
}

export type RateOutcome =
  | {
      ok: true;
      due: number;
      /** When the rated card comes back, as an ISO time. */ nextDue: string;
    }
  | { ok: false; message: string };

export const REVIEW_RATINGS = ['again', 'hard', 'good', 'easy'] as const;
export type ReviewRatingName = (typeof REVIEW_RATINGS)[number];

const GENDERS = { m: 'masculine', f: 'feminine', n: 'neuter' } as const;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function firstExample(payload: Record<string, unknown>): ReviewExample | null {
  const examples = Array.isArray(payload.examples) ? payload.examples : [];
  for (const entry of examples) {
    if (typeof entry !== 'object' || entry === null) continue;
    const typed = entry as Record<string, unknown>;
    const sentence = text(typed.text);
    const gloss = text(typed.gloss_en);
    if (sentence !== null && gloss !== null) return { text: sentence, glossEn: gloss };
  }
  return null;
}

/** The card for an item. Fields the payload does not have are left empty. */
export function cardViewFor(item: Item): ReviewCardView {
  const payload =
    typeof item.payload === 'object' && item.payload !== null
      ? (item.payload as Record<string, unknown>)
      : {};
  const genderKey = payload.gender;
  const gender = genderKey === 'm' || genderKey === 'f' || genderKey === 'n' ? genderKey : null;
  const plural = text(payload.plural);
  return {
    itemId: item.id,
    lemma: item.lemma,
    gloss: item.glossEn,
    example: firstExample(payload),
    gender: gender === null ? null : GENDERS[gender],
    plural: plural === null || plural === 'none' ? null : plural,
  };
}

/** The line under the meaning: gender and plural for a noun, then one example. */
export function cardDetails(card: ReviewCardView): string {
  const parts: string[] = [];
  if (card.gender !== null) parts.push(`Gender: ${card.gender}.`);
  if (card.plural !== null) parts.push(`Plural: ${card.plural}.`);
  if (card.example !== null) parts.push(`Example: ${card.example.text} (${card.example.glossEn})`);
  return parts.join(' ');
}

export type ReviewTally = Record<ReviewRatingName, number>;

/** "14 reviewed. 3 again, 9 good, 2 easy." Ratings nobody gave are left out. */
export function tallySentence(tally: ReviewTally): string {
  const total = REVIEW_RATINGS.reduce((sum, rating) => sum + tally[rating], 0);
  const parts = REVIEW_RATINGS.filter((rating) => tally[rating] > 0).map(
    (rating) => `${tally[rating]} ${rating}`,
  );
  return parts.length === 0 ? `${total} reviewed.` : `${total} reviewed. ${parts.join(', ')}.`;
}
