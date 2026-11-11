// Verb data for conjugate.ts. Everything a rule cannot derive is listed here:
// irregular present forms, stem changes, separable prefixes and participles.
// The lists cover A1 and grow with each level. Forms follow the standard
// paradigm (Duden).

export const PERSONS = ['1sg', '2sg', '3sg', '1pl', '2pl', '3pl'] as const;
export type Person = (typeof PERSONS)[number];

export type Auxiliary = 'haben' | 'sein';

/** Six present forms in the order ich, du, er/sie/es, wir, ihr, sie/Sie. */
type PresentForms = readonly [string, string, string, string, string, string];

/** Verbs whose present tense is listed in full. */
export const IRREGULAR_PRESENT: Readonly<Record<string, PresentForms>> = {
  sein: ['bin', 'bist', 'ist', 'sind', 'seid', 'sind'],
  haben: ['habe', 'hast', 'hat', 'haben', 'habt', 'haben'],
  werden: ['werde', 'wirst', 'wird', 'werden', 'werdet', 'werden'],
  wissen: ['weiß', 'weißt', 'weiß', 'wissen', 'wisst', 'wissen'],
  können: ['kann', 'kannst', 'kann', 'können', 'könnt', 'können'],
  müssen: ['muss', 'musst', 'muss', 'müssen', 'müsst', 'müssen'],
  wollen: ['will', 'willst', 'will', 'wollen', 'wollt', 'wollen'],
  sollen: ['soll', 'sollst', 'soll', 'sollen', 'sollt', 'sollen'],
  dürfen: ['darf', 'darfst', 'darf', 'dürfen', 'dürft', 'dürfen'],
  mögen: ['mag', 'magst', 'mag', 'mögen', 'mögt', 'mögen'],
  möchten: ['möchte', 'möchtest', 'möchte', 'möchten', 'möchtet', 'möchten'],
  tun: ['tue', 'tust', 'tut', 'tun', 'tut', 'tun'],
};

/** Verbs that change their stem vowel in the du and er/sie/es forms only. */
export const STEM_CHANGES: Readonly<Record<string, { '2sg': string; '3sg': string }>> = {
  fahren: { '2sg': 'fährst', '3sg': 'fährt' },
  sprechen: { '2sg': 'sprichst', '3sg': 'spricht' },
  lesen: { '2sg': 'liest', '3sg': 'liest' },
  sehen: { '2sg': 'siehst', '3sg': 'sieht' },
  nehmen: { '2sg': 'nimmst', '3sg': 'nimmt' },
  essen: { '2sg': 'isst', '3sg': 'isst' },
  geben: { '2sg': 'gibst', '3sg': 'gibt' },
  schlafen: { '2sg': 'schläfst', '3sg': 'schläft' },
  laufen: { '2sg': 'läufst', '3sg': 'läuft' },
  treffen: { '2sg': 'triffst', '3sg': 'trifft' },
  helfen: { '2sg': 'hilfst', '3sg': 'hilft' },
  // Not in the first A1 list, but needed so that common separable and prefixed
  // verbs (anfangen, einladen, gefallen) do not come out with a regular stem.
  tragen: { '2sg': 'trägst', '3sg': 'trägt' },
  waschen: { '2sg': 'wäschst', '3sg': 'wäscht' },
  fangen: { '2sg': 'fängst', '3sg': 'fängt' },
  laden: { '2sg': 'lädst', '3sg': 'lädt' },
  halten: { '2sg': 'hältst', '3sg': 'hält' },
  lassen: { '2sg': 'lässt', '3sg': 'lässt' },
  fallen: { '2sg': 'fällst', '3sg': 'fällt' },
  vergessen: { '2sg': 'vergisst', '3sg': 'vergisst' },
};

/** Separable prefixes, longest first so that zurück and zusammen win over zu. */
export const SEPARABLE_PREFIXES: readonly string[] = [
  'zusammen',
  'zurück',
  'fern',
  'nach',
  'auf',
  'aus',
  'ein',
  'mit',
  'vor',
  'weg',
  'ab',
  'an',
  'zu',
];

/** Verbs that begin with the letters of a separable prefix but do not separate. */
export const NOT_SEPARABLE: ReadonlySet<string> = new Set([
  'antworten',
  'angeln',
  'ankern',
  'animieren',
  'annoncieren',
  'annullieren',
  'analysieren',
  'abonnieren',
  'absolvieren',
  'absorbieren',
  'abstrahieren',
  'einen',
  'einigen',
  'zuckern',
  'zuckeln',
  'mitteln',
]);

/** Prefixes that never separate. A listed stem change carries over: versprechen, du versprichst. */
export const INSEPARABLE_PREFIXES: readonly string[] = [
  'miss',
  'emp',
  'ent',
  'ver',
  'zer',
  'be',
  'er',
  'ge',
];

export interface ParticipleEntry {
  participle: string;
  auxiliary: Auxiliary;
}

const withHaben = (participle: string): ParticipleEntry => ({ participle, auxiliary: 'haben' });
const withSein = (participle: string): ParticipleEntry => ({ participle, auxiliary: 'sein' });

/**
 * Partizip II and Perfekt auxiliary, listed per verb. möchten is absent on
 * purpose: it has no participle of its own.
 */
export const PARTICIPLES: Readonly<Record<string, ParticipleEntry>> = {
  sein: withSein('gewesen'),
  haben: withHaben('gehabt'),
  werden: withSein('geworden'),
  wissen: withHaben('gewusst'),
  können: withHaben('gekonnt'),
  müssen: withHaben('gemusst'),
  wollen: withHaben('gewollt'),
  sollen: withHaben('gesollt'),
  dürfen: withHaben('gedurft'),
  mögen: withHaben('gemocht'),
  tun: withHaben('getan'),
  fahren: withSein('gefahren'),
  sprechen: withHaben('gesprochen'),
  lesen: withHaben('gelesen'),
  sehen: withHaben('gesehen'),
  nehmen: withHaben('genommen'),
  essen: withHaben('gegessen'),
  geben: withHaben('gegeben'),
  schlafen: withHaben('geschlafen'),
  laufen: withSein('gelaufen'),
  treffen: withHaben('getroffen'),
  helfen: withHaben('geholfen'),
  // Further common A1 verbs, so that the Perfekt of everyday verbs is known.
  kommen: withSein('gekommen'),
  gehen: withSein('gegangen'),
  bleiben: withSein('geblieben'),
  heißen: withHaben('geheißen'),
  stehen: withHaben('gestanden'),
  trinken: withHaben('getrunken'),
  finden: withHaben('gefunden'),
  schreiben: withHaben('geschrieben'),
  rufen: withHaben('gerufen'),
  tragen: withHaben('getragen'),
  waschen: withHaben('gewaschen'),
  fangen: withHaben('gefangen'),
  laden: withHaben('geladen'),
  halten: withHaben('gehalten'),
  lassen: withHaben('gelassen'),
  fallen: withSein('gefallen'),
  machen: withHaben('gemacht'),
  wohnen: withHaben('gewohnt'),
  lernen: withHaben('gelernt'),
  arbeiten: withHaben('gearbeitet'),
  kaufen: withHaben('gekauft'),
  spielen: withHaben('gespielt'),
  hören: withHaben('gehört'),
  sagen: withHaben('gesagt'),
  fragen: withHaben('gefragt'),
  // Verbs with an inseparable prefix form the participle without ge.
  vergessen: withHaben('vergessen'),
  gefallen: withHaben('gefallen'),
  bekommen: withHaben('bekommen'),
  verstehen: withHaben('verstanden'),
  beginnen: withHaben('begonnen'),
  besuchen: withHaben('besucht'),
  bezahlen: withHaben('bezahlt'),
};

/**
 * Separable verbs whose auxiliary differs from that of their base verb:
 * schlafen takes haben but einschlafen takes sein.
 */
export const SEPARABLE_AUXILIARY: Readonly<Record<string, Auxiliary>> = {
  einschlafen: 'sein',
  eintreffen: 'sein',
  auftreffen: 'sein',
  aufstehen: 'sein',
};
