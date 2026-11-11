// Assembles the German LanguageRules object from the rule modules and the
// pack's own items. Items supply what is lexical: noun gender, and the present
// forms of the verbs the pack lists.

import type { ItemInput, LanguageRules } from '@stufen/contracts';
import { DEFINITE_ARTICLES } from './articles';
import { createClassifyError } from './classify-error';
import { conjugate, parsePerson, parseTense } from './conjugate';
import { createNounGender } from './gender';
import { normalize } from './normalize';

export type Conjugate = (verb: string, person: string, tense: string) => string | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * conjugate that asks the pack first. A verb item may list its present forms in
 * payload.forms under 1sg to 3pl. Those win over the rules, so a strong verb the
 * rule tables do not list yet is still conjugated as the content states it.
 * Everything else, and every Perfekt form, comes from the rules.
 */
export function createConjugate(items: readonly ItemInput[]): Conjugate {
  const listed = new Map<string, Record<string, unknown>>();
  for (const item of items) {
    if (item.kind !== 'vocab' || item.payload.pos !== 'verb') continue;
    if (isRecord(item.payload.forms)) {
      listed.set(item.lemma.trim().toLocaleLowerCase('de-DE'), item.payload.forms);
    }
  }
  return (verb, person, tense) => {
    const parsedPerson = parsePerson(person);
    if (parsedPerson !== undefined && parseTense(tense) === 'present') {
      const forms = listed.get(verb.trim().toLocaleLowerCase('de-DE'));
      const form =
        forms !== undefined && Object.hasOwn(forms, parsedPerson) ? forms[parsedPerson] : undefined;
      if (typeof form === 'string' && form !== '') return form;
    }
    return conjugate(verb, person, tense);
  };
}

/**
 * The German rules for one set of items. `articles` is the definite article
 * table, which is what the contracts shape has room for; the indefinite,
 * negative and possessive tables are exported from this box next to it.
 */
export function germanRules(items: readonly ItemInput[]): LanguageRules {
  const nounGender = createNounGender(items);
  return {
    articles: DEFINITE_ARTICLES,
    nounGender,
    conjugate: createConjugate(items),
    normalize,
    classifyError: createClassifyError(nounGender),
  };
}
