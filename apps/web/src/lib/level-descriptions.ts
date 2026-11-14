// The short official description of each CEFR level, shown on the level
// cards of /progress.
//
// Source: docs/14-levels-in-real-life.md, section 2, the "Global scale (S2)"
// paragraph of each level. That document paraphrases the Council of Europe's
// CEFR global scale (Table 1) closely and names its sources at the end. The
// six texts are copied from there. Change them there first, then here.

import type { CefrLevel } from '@stufen/contracts';

export const LEVEL_DESCRIPTIONS: Record<CefrLevel, string> = {
  A1:
    'Can understand and use familiar everyday expressions and very basic phrases aimed at ' +
    'concrete needs. Can introduce self and others, ask and answer questions about personal ' +
    'details such as where they live, people they know and things they have. Can interact in ' +
    'a simple way if the other person talks slowly and clearly and is prepared to help.',
  A2:
    'Can understand sentences and frequently used expressions about areas of most immediate ' +
    'relevance (basic personal and family information, shopping, local geography, employment). ' +
    'Can communicate in simple routine tasks that need a simple direct exchange of information ' +
    'on familiar matters. Can describe in simple terms their background, immediate environment ' +
    'and matters of immediate need.',
  B1:
    'Can understand the main points of clear standard input on familiar matters met regularly ' +
    'at work, school and leisure. Can deal with most situations likely to arise while ' +
    'travelling where the language is spoken. Can produce simple connected text on familiar ' +
    'topics or of personal interest. Can describe experiences, events, dreams, hopes and ' +
    'ambitions and briefly give reasons and explanations for opinions and plans.',
  B2:
    'Can understand the main ideas of complex text on both concrete and abstract topics, ' +
    'including technical discussions in their own field. Can interact with a degree of fluency ' +
    'and spontaneity that makes regular interaction with native speakers possible without ' +
    'strain for either side. Can produce clear detailed text on a wide range of subjects and ' +
    'explain a viewpoint on a topical issue giving the advantages and disadvantages of ' +
    'various options.',
  C1:
    'Can understand a wide range of demanding longer texts and recognise implicit meaning. ' +
    'Can express themselves fluently and spontaneously without much obvious searching for ' +
    'expressions. Can use language flexibly and effectively for social, academic and ' +
    'professional purposes. Can produce clear, well structured, detailed text on complex ' +
    'subjects, showing controlled use of organisational patterns, connectors and cohesive ' +
    'devices.',
  C2:
    'Can understand with ease virtually everything heard or read. Can summarise information ' +
    'from different spoken and written sources, reconstructing arguments and accounts in a ' +
    'coherent presentation. Can express themselves spontaneously, very fluently and precisely, ' +
    'differentiating finer shades of meaning even in the most complex situations.',
};

/** Said on every level card. The app estimates. It does not certify. */
export const NOT_A_CERTIFICATE =
  'What Stufen shows for this level is an estimate from your checked work. It is not a certificate.';
