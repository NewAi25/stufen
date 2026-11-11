// German verb conjugation for the levels the pack covers. Present tense and
// Perfekt only. Regular verbs follow rules; everything else is listed in
// verb-tables.ts. An unknown person, tense or word shape gives undefined.
//
// Limit to know about: a verb that is not listed is treated as regular. A
// strong verb missing from the lists comes out with a regular stem, so the
// lists must grow together with the content pack.

import {
  INSEPARABLE_PREFIXES,
  LISTED_SEPARABLE,
  IRREGULAR_PRESENT,
  NOT_SEPARABLE,
  PARTICIPLES,
  PERSONS,
  SEPARABLE_AUXILIARY,
  SEPARABLE_PREFIXES,
  STEM_CHANGES,
} from './verb-tables';
import type { ParticipleEntry, Person } from './verb-tables';

export type Tense = 'present' | 'perfekt';

/** Own property lookup, so that a word like "constructor" never hits Object.prototype. */
function lookup<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

const PERSON_ALIASES: Readonly<Record<string, Person>> = {
  '1sg': '1sg',
  ich: '1sg',
  '2sg': '2sg',
  du: '2sg',
  '3sg': '3sg',
  er: '3sg',
  sie: '3sg',
  es: '3sg',
  man: '3sg',
  'er/sie/es': '3sg',
  '1pl': '1pl',
  wir: '1pl',
  '2pl': '2pl',
  ihr: '2pl',
  '3pl': '3pl',
  sie_plural: '3pl',
  sie_pl: '3pl',
};

const TENSE_ALIASES: Readonly<Record<string, Tense>> = {
  present: 'present',
  präsens: 'present',
  praesens: 'present',
  perfekt: 'perfekt',
  perfect: 'perfekt',
};

/**
 * Reads a person. Accepts 1sg to 3pl or a pronoun. "sie" is she, "sie_plural"
 * is they, and "Sie" with a capital is the formal address, which takes the
 * third person plural form.
 */
export function parsePerson(person: string): Person | undefined {
  const text = person.trim();
  if (text === 'Sie') return '3pl';
  return lookup(PERSON_ALIASES, text.toLowerCase());
}

export function parseTense(tense: string): Tense | undefined {
  return lookup(TENSE_ALIASES, tense.trim().toLocaleLowerCase('de-DE'));
}

const VERB_SHAPE = /^[a-zäöüß]+$/u;
const VOWEL = /[aeiouäöüy]/u;
/** Stems that need an e before st and t: arbeitest, findet, atmet, öffnest, rechnet. */
const NEEDS_LINKING_E = /(?:[td]|(?:[^aeiouäöüylrmnh]|ch)[mn])$/u;
/** Stems ending in an s sound take t, not st, in the du form: du heißt, du tanzt. */
const SIBILANT_END = /[sßzx]$/u;

function isListed(verb: string): boolean {
  return Object.hasOwn(IRREGULAR_PRESENT, verb) || Object.hasOwn(STEM_CHANGES, verb);
}

/** True when the word has the shape of an infinitive the regular rule can handle. */
function isRegularShape(verb: string): boolean {
  if (!VERB_SHAPE.test(verb)) return false;
  if (verb.endsWith('eln') || verb.endsWith('ern')) return VOWEL.test(verb.slice(0, -3));
  return verb.endsWith('en') && VOWEL.test(verb.slice(0, -2));
}

/** Present tense by rule. Six forms in the order of PERSONS. */
function regularPresent(verb: string): readonly string[] | undefined {
  if (!isRegularShape(verb)) return undefined;
  if (verb.endsWith('eln')) {
    // sammeln: ich sammle, du sammelst, wir sammeln.
    const stem = verb.slice(0, -1);
    const first = `${verb.slice(0, -3)}le`;
    return [first, `${stem}st`, `${stem}t`, verb, `${stem}t`, verb];
  }
  if (verb.endsWith('ern')) {
    // wandern: ich wandere, du wanderst, wir wandern.
    const stem = verb.slice(0, -1);
    return [`${stem}e`, `${stem}st`, `${stem}t`, verb, `${stem}t`, verb];
  }
  const stem = verb.slice(0, -2);
  const link = NEEDS_LINKING_E.test(stem) ? 'e' : '';
  const second = SIBILANT_END.test(stem) ? `${stem}t` : `${stem}${link}st`;
  return [`${stem}e`, second, `${stem}${link}t`, verb, `${stem}${link}t`, verb];
}

/** Present tense of a verb without a separable prefix. */
function basePresent(verb: string): readonly string[] | undefined {
  const irregular = lookup(IRREGULAR_PRESENT, verb);
  if (irregular !== undefined) return irregular;
  const regular = regularPresent(verb);
  if (regular === undefined) return undefined;

  let change = lookup(STEM_CHANGES, verb);
  let prefix = '';
  if (change === undefined) {
    // versprechen takes the stem change of sprechen: du versprichst.
    for (const candidate of INSEPARABLE_PREFIXES) {
      if (!verb.startsWith(candidate)) continue;
      const inherited = lookup(STEM_CHANGES, verb.slice(candidate.length));
      if (inherited === undefined) continue;
      change = inherited;
      prefix = candidate;
      break;
    }
  }
  if (change === undefined) return regular;
  const forms = [...regular];
  forms[1] = `${prefix}${change['2sg']}`;
  forms[2] = `${prefix}${change['3sg']}`;
  return forms;
}

export interface SeparableVerb {
  prefix: string;
  base: string;
}

/**
 * Splits a separable verb into prefix and base verb: aufstehen gives auf and
 * stehen. Detection is by the listed prefixes, with a list of verbs that only
 * look separable (antworten). Returns undefined for any other verb.
 */
export function splitSeparable(verb: string): SeparableVerb | undefined {
  const word = verb.trim().toLocaleLowerCase('de-DE');
  if (isListed(word) || Object.hasOwn(PARTICIPLES, word) || NOT_SEPARABLE.has(word)) {
    return undefined;
  }
  const listedPrefix = lookup(LISTED_SEPARABLE, word);
  if (listedPrefix !== undefined) {
    return { prefix: listedPrefix, base: word.slice(listedPrefix.length) };
  }
  for (const prefix of SEPARABLE_PREFIXES) {
    if (!word.startsWith(prefix)) continue;
    const base = word.slice(prefix.length);
    if (isListed(base) || (base.length >= 4 && isRegularShape(base))) return { prefix, base };
  }
  return undefined;
}

/**
 * A verb written as a noun and a verb, such as "Rad fahren": the verb is
 * conjugated and the noun follows it as written. Only a single capitalised
 * word counts as the noun, so "nicht gehen" is not taken for a verb.
 */
function splitPhrase(verb: string): { complement: string; verb: string } | undefined {
  const words = verb.trim().split(/\s+/);
  if (words.length !== 2) return undefined;
  const [complement, base] = words as [string, string];
  const first = complement.charAt(0);
  if (first === first.toLocaleLowerCase('de-DE')) return undefined;
  return { complement, verb: base };
}

/** Partizip II and Perfekt auxiliary where the verb or its base verb is listed. */
export function participle(verb: string): ParticipleEntry | undefined {
  const phrase = splitPhrase(verb);
  if (phrase !== undefined) {
    const inner = participle(phrase.verb);
    if (inner === undefined) return undefined;
    return { participle: `${phrase.complement} ${inner.participle}`, auxiliary: inner.auxiliary };
  }
  const word = verb.trim().toLocaleLowerCase('de-DE');
  const listed = lookup(PARTICIPLES, word);
  if (listed !== undefined) return listed;
  const split = splitSeparable(word);
  if (split === undefined) return undefined;
  const base = lookup(PARTICIPLES, split.base);
  if (base === undefined) return undefined;
  return {
    participle: `${split.prefix}${base.participle}`,
    auxiliary: lookup(SEPARABLE_AUXILIARY, word) ?? base.auxiliary,
  };
}

function present(word: string, index: number): string | undefined {
  const split = splitSeparable(word);
  if (split === undefined) return basePresent(word)?.[index];
  const finite = basePresent(split.base)?.[index];
  return finite === undefined ? undefined : `${finite} ${split.prefix}`;
}

/**
 * Conjugates a verb given as an infinitive. Present: "fährst", and for a
 * separable verb the split form "stehst auf". Perfekt: auxiliary and
 * participle, "bin gefahren". Returns undefined when it does not know.
 */
export function conjugate(verb: string, person: string, tense: string): string | undefined {
  const parsedPerson = parsePerson(person);
  const parsedTense = parseTense(tense);
  if (parsedPerson === undefined || parsedTense === undefined) return undefined;
  const index = PERSONS.indexOf(parsedPerson);
  const phrase = splitPhrase(verb);
  if (phrase !== undefined && parsedTense === 'present') {
    const finite = conjugate(phrase.verb, person, tense);
    return finite === undefined ? undefined : `${finite} ${phrase.complement}`;
  }
  const word = verb.trim().toLocaleLowerCase('de-DE');
  if (parsedTense === 'present') return present(word, index);
  const entry = participle(verb);
  if (entry === undefined) return undefined;
  const auxiliary = lookup(IRREGULAR_PRESENT, entry.auxiliary)?.[index];
  return auxiliary === undefined ? undefined : `${auxiliary} ${entry.participle}`;
}
