import { describe, expect, it } from 'vitest';
import { conjugate, parsePerson, participle, splitSeparable } from '../src/rules/conjugate';
import { PERSONS } from '../src/rules/verb-tables';

// Every row: infinitive, then ich, du, er/sie/es, wir, ihr, sie/Sie.
// Written out by hand from the standard paradigm, not generated.
type Row = [string, string, string, string, string, string, string];

const PRESENT: Row[] = [
  // listed irregular verbs
  ['sein', 'bin', 'bist', 'ist', 'sind', 'seid', 'sind'],
  ['haben', 'habe', 'hast', 'hat', 'haben', 'habt', 'haben'],
  ['werden', 'werde', 'wirst', 'wird', 'werden', 'werdet', 'werden'],
  ['wissen', 'weiß', 'weißt', 'weiß', 'wissen', 'wisst', 'wissen'],
  ['können', 'kann', 'kannst', 'kann', 'können', 'könnt', 'können'],
  ['müssen', 'muss', 'musst', 'muss', 'müssen', 'müsst', 'müssen'],
  ['wollen', 'will', 'willst', 'will', 'wollen', 'wollt', 'wollen'],
  ['sollen', 'soll', 'sollst', 'soll', 'sollen', 'sollt', 'sollen'],
  ['dürfen', 'darf', 'darfst', 'darf', 'dürfen', 'dürft', 'dürfen'],
  ['mögen', 'mag', 'magst', 'mag', 'mögen', 'mögt', 'mögen'],
  ['möchten', 'möchte', 'möchtest', 'möchte', 'möchten', 'möchtet', 'möchten'],
  ['tun', 'tue', 'tust', 'tut', 'tun', 'tut', 'tun'],
  // stem changing verbs
  ['fahren', 'fahre', 'fährst', 'fährt', 'fahren', 'fahrt', 'fahren'],
  ['sprechen', 'spreche', 'sprichst', 'spricht', 'sprechen', 'sprecht', 'sprechen'],
  ['lesen', 'lese', 'liest', 'liest', 'lesen', 'lest', 'lesen'],
  ['sehen', 'sehe', 'siehst', 'sieht', 'sehen', 'seht', 'sehen'],
  ['nehmen', 'nehme', 'nimmst', 'nimmt', 'nehmen', 'nehmt', 'nehmen'],
  ['essen', 'esse', 'isst', 'isst', 'essen', 'esst', 'essen'],
  ['geben', 'gebe', 'gibst', 'gibt', 'geben', 'gebt', 'geben'],
  ['schlafen', 'schlafe', 'schläfst', 'schläft', 'schlafen', 'schlaft', 'schlafen'],
  ['laufen', 'laufe', 'läufst', 'läuft', 'laufen', 'lauft', 'laufen'],
  ['treffen', 'treffe', 'triffst', 'trifft', 'treffen', 'trefft', 'treffen'],
  ['helfen', 'helfe', 'hilfst', 'hilft', 'helfen', 'helft', 'helfen'],
  ['halten', 'halte', 'hältst', 'hält', 'halten', 'haltet', 'halten'],
  ['laden', 'lade', 'lädst', 'lädt', 'laden', 'ladet', 'laden'],
  ['waschen', 'wasche', 'wäschst', 'wäscht', 'waschen', 'wascht', 'waschen'],
  ['vergessen', 'vergesse', 'vergisst', 'vergisst', 'vergessen', 'vergesst', 'vergessen'],
  // stem change carried over an inseparable prefix
  ['gefallen', 'gefalle', 'gefällst', 'gefällt', 'gefallen', 'gefallt', 'gefallen'],
  [
    'versprechen',
    'verspreche',
    'versprichst',
    'verspricht',
    'versprechen',
    'versprecht',
    'versprechen',
  ],
  // regular verbs
  ['wohnen', 'wohne', 'wohnst', 'wohnt', 'wohnen', 'wohnt', 'wohnen'],
  ['kommen', 'komme', 'kommst', 'kommt', 'kommen', 'kommt', 'kommen'],
  ['machen', 'mache', 'machst', 'macht', 'machen', 'macht', 'machen'],
  ['lernen', 'lerne', 'lernst', 'lernt', 'lernen', 'lernt', 'lernen'],
  ['gehen', 'gehe', 'gehst', 'geht', 'gehen', 'geht', 'gehen'],
  ['studieren', 'studiere', 'studierst', 'studiert', 'studieren', 'studiert', 'studieren'],
  ['bekommen', 'bekomme', 'bekommst', 'bekommt', 'bekommen', 'bekommt', 'bekommen'],
  // stems ending in t or d, or in a consonant plus m or n
  ['arbeiten', 'arbeite', 'arbeitest', 'arbeitet', 'arbeiten', 'arbeitet', 'arbeiten'],
  ['finden', 'finde', 'findest', 'findet', 'finden', 'findet', 'finden'],
  ['antworten', 'antworte', 'antwortest', 'antwortet', 'antworten', 'antwortet', 'antworten'],
  ['kosten', 'koste', 'kostest', 'kostet', 'kosten', 'kostet', 'kosten'],
  ['öffnen', 'öffne', 'öffnest', 'öffnet', 'öffnen', 'öffnet', 'öffnen'],
  ['rechnen', 'rechne', 'rechnest', 'rechnet', 'rechnen', 'rechnet', 'rechnen'],
  ['atmen', 'atme', 'atmest', 'atmet', 'atmen', 'atmet', 'atmen'],
  // stems ending in s, ß, z or x
  ['heißen', 'heiße', 'heißt', 'heißt', 'heißen', 'heißt', 'heißen'],
  ['reisen', 'reise', 'reist', 'reist', 'reisen', 'reist', 'reisen'],
  ['tanzen', 'tanze', 'tanzt', 'tanzt', 'tanzen', 'tanzt', 'tanzen'],
  ['sitzen', 'sitze', 'sitzt', 'sitzt', 'sitzen', 'sitzt', 'sitzen'],
  ['küssen', 'küsse', 'küsst', 'küsst', 'küssen', 'küsst', 'küssen'],
  ['mixen', 'mixe', 'mixt', 'mixt', 'mixen', 'mixt', 'mixen'],
  // infinitives in eln and ern
  ['sammeln', 'sammle', 'sammelst', 'sammelt', 'sammeln', 'sammelt', 'sammeln'],
  ['klingeln', 'klingle', 'klingelst', 'klingelt', 'klingeln', 'klingelt', 'klingeln'],
  ['wandern', 'wandere', 'wanderst', 'wandert', 'wandern', 'wandert', 'wandern'],
  ['feiern', 'feiere', 'feierst', 'feiert', 'feiern', 'feiert', 'feiern'],
  // separable verbs give the split form
  ['aufstehen', 'stehe auf', 'stehst auf', 'steht auf', 'stehen auf', 'steht auf', 'stehen auf'],
  ['einkaufen', 'kaufe ein', 'kaufst ein', 'kauft ein', 'kaufen ein', 'kauft ein', 'kaufen ein'],
  ['fernsehen', 'sehe fern', 'siehst fern', 'sieht fern', 'sehen fern', 'seht fern', 'sehen fern'],
  ['anfangen', 'fange an', 'fängst an', 'fängt an', 'fangen an', 'fangt an', 'fangen an'],
  ['einladen', 'lade ein', 'lädst ein', 'lädt ein', 'laden ein', 'ladet ein', 'laden ein'],
  ['mitnehmen', 'nehme mit', 'nimmst mit', 'nimmt mit', 'nehmen mit', 'nehmt mit', 'nehmen mit'],
  ['abfahren', 'fahre ab', 'fährst ab', 'fährt ab', 'fahren ab', 'fahrt ab', 'fahren ab'],
  ['zuhören', 'höre zu', 'hörst zu', 'hört zu', 'hören zu', 'hört zu', 'hören zu'],
  ['anrufen', 'rufe an', 'rufst an', 'ruft an', 'rufen an', 'ruft an', 'rufen an'],
  [
    'vorbereiten',
    'bereite vor',
    'bereitest vor',
    'bereitet vor',
    'bereiten vor',
    'bereitet vor',
    'bereiten vor',
  ],
  [
    'zurückkommen',
    'komme zurück',
    'kommst zurück',
    'kommt zurück',
    'kommen zurück',
    'kommt zurück',
    'kommen zurück',
  ],
];

describe('conjugate, present tense', () => {
  const forms = PRESENT.flatMap(([verb, ...row]) =>
    PERSONS.map((person, index) => [verb, person, row[index]] as [string, string, string]),
  );

  it('checks at least 60 forms', () => {
    expect(forms.length).toBeGreaterThanOrEqual(60);
  });

  it.each(forms)('%s %s is "%s"', (verb, person, form) => {
    expect(conjugate(verb, person, 'present')).toBe(form);
  });
});

describe('participle and Perfekt', () => {
  // infinitive, Partizip II, auxiliary, then the ich form and the er form of the Perfekt
  const rows: [string, string, 'haben' | 'sein', string, string][] = [
    ['sein', 'gewesen', 'sein', 'bin gewesen', 'ist gewesen'],
    ['haben', 'gehabt', 'haben', 'habe gehabt', 'hat gehabt'],
    ['werden', 'geworden', 'sein', 'bin geworden', 'ist geworden'],
    ['wissen', 'gewusst', 'haben', 'habe gewusst', 'hat gewusst'],
    ['können', 'gekonnt', 'haben', 'habe gekonnt', 'hat gekonnt'],
    ['müssen', 'gemusst', 'haben', 'habe gemusst', 'hat gemusst'],
    ['wollen', 'gewollt', 'haben', 'habe gewollt', 'hat gewollt'],
    ['sollen', 'gesollt', 'haben', 'habe gesollt', 'hat gesollt'],
    ['dürfen', 'gedurft', 'haben', 'habe gedurft', 'hat gedurft'],
    ['mögen', 'gemocht', 'haben', 'habe gemocht', 'hat gemocht'],
    ['fahren', 'gefahren', 'sein', 'bin gefahren', 'ist gefahren'],
    ['sprechen', 'gesprochen', 'haben', 'habe gesprochen', 'hat gesprochen'],
    ['lesen', 'gelesen', 'haben', 'habe gelesen', 'hat gelesen'],
    ['sehen', 'gesehen', 'haben', 'habe gesehen', 'hat gesehen'],
    ['nehmen', 'genommen', 'haben', 'habe genommen', 'hat genommen'],
    ['essen', 'gegessen', 'haben', 'habe gegessen', 'hat gegessen'],
    ['geben', 'gegeben', 'haben', 'habe gegeben', 'hat gegeben'],
    ['schlafen', 'geschlafen', 'haben', 'habe geschlafen', 'hat geschlafen'],
    ['laufen', 'gelaufen', 'sein', 'bin gelaufen', 'ist gelaufen'],
    ['treffen', 'getroffen', 'haben', 'habe getroffen', 'hat getroffen'],
    ['helfen', 'geholfen', 'haben', 'habe geholfen', 'hat geholfen'],
    ['kommen', 'gekommen', 'sein', 'bin gekommen', 'ist gekommen'],
    ['gehen', 'gegangen', 'sein', 'bin gegangen', 'ist gegangen'],
    ['bleiben', 'geblieben', 'sein', 'bin geblieben', 'ist geblieben'],
    ['arbeiten', 'gearbeitet', 'haben', 'habe gearbeitet', 'hat gearbeitet'],
    ['vergessen', 'vergessen', 'haben', 'habe vergessen', 'hat vergessen'],
    ['verstehen', 'verstanden', 'haben', 'habe verstanden', 'hat verstanden'],
    // separable verbs put ge between prefix and stem
    ['fernsehen', 'ferngesehen', 'haben', 'habe ferngesehen', 'hat ferngesehen'],
    ['einkaufen', 'eingekauft', 'haben', 'habe eingekauft', 'hat eingekauft'],
    ['anrufen', 'angerufen', 'haben', 'habe angerufen', 'hat angerufen'],
    ['anfangen', 'angefangen', 'haben', 'habe angefangen', 'hat angefangen'],
    ['mitnehmen', 'mitgenommen', 'haben', 'habe mitgenommen', 'hat mitgenommen'],
    ['abfahren', 'abgefahren', 'sein', 'bin abgefahren', 'ist abgefahren'],
    ['zurückkommen', 'zurückgekommen', 'sein', 'bin zurückgekommen', 'ist zurückgekommen'],
    // the auxiliary differs from the base verb
    ['aufstehen', 'aufgestanden', 'sein', 'bin aufgestanden', 'ist aufgestanden'],
    ['einschlafen', 'eingeschlafen', 'sein', 'bin eingeschlafen', 'ist eingeschlafen'],
  ];

  it.each(rows)('%s: %s with %s', (verb, form, auxiliary, first, third) => {
    expect(participle(verb)).toEqual({ participle: form, auxiliary });
    expect(conjugate(verb, '1sg', 'perfekt')).toBe(first);
    expect(conjugate(verb, '3sg', 'perfekt')).toBe(third);
  });

  it('conjugates the auxiliary for every person', () => {
    const forms = PERSONS.map((person) => conjugate('fahren', person, 'perfekt'));
    expect(forms).toEqual([
      'bin gefahren',
      'bist gefahren',
      'ist gefahren',
      'sind gefahren',
      'seid gefahren',
      'sind gefahren',
    ]);
  });

  it('does not invent a participle that is not listed', () => {
    expect(participle('möchten')).toBeUndefined();
    expect(conjugate('möchten', '1sg', 'perfekt')).toBeUndefined();
    expect(conjugate('tanzen', '1sg', 'perfekt')).toBeUndefined();
    expect(conjugate('vorbereiten', '1sg', 'perfekt')).toBeUndefined();
  });
});

describe('persons, tenses and separable detection', () => {
  const aliases: [string, string][] = [
    ['ich', 'bin'],
    ['du', 'bist'],
    ['er', 'ist'],
    ['sie', 'ist'],
    ['es', 'ist'],
    ['man', 'ist'],
    ['wir', 'sind'],
    ['ihr', 'seid'],
    ['sie_plural', 'sind'],
    ['Sie', 'sind'],
    ['Ich', 'bin'],
    [' 2sg ', 'bist'],
  ];
  it.each(aliases)('person "%s" of sein is %s', (person, form) => {
    expect(conjugate('sein', person, 'present')).toBe(form);
  });

  it('tells the formal Sie from sie', () => {
    expect(parsePerson('Sie')).toBe('3pl');
    expect(parsePerson('sie')).toBe('3sg');
  });

  it('accepts German tense names and a capitalised infinitive', () => {
    expect(conjugate('fahren', 'du', 'Präsens')).toBe('fährst');
    expect(conjugate('fahren', 'du', 'praesens')).toBe('fährst');
    expect(conjugate('Fahren', 'du', 'Perfekt')).toBe('bist gefahren');
  });

  const separable: [string, string, string][] = [
    ['aufstehen', 'auf', 'stehen'],
    ['zurückgeben', 'zurück', 'geben'],
    ['zusammenarbeiten', 'zusammen', 'arbeiten'],
    ['zumachen', 'zu', 'machen'],
    ['wegfahren', 'weg', 'fahren'],
    ['nachfragen', 'nach', 'fragen'],
    ['vorhaben', 'vor', 'haben'],
    ['ausgehen', 'aus', 'gehen'],
  ];
  it.each(separable)('%s splits into %s and %s', (verb, prefix, base) => {
    expect(splitSeparable(verb)).toEqual({ prefix, base });
  });

  const whole = ['antworten', 'arbeiten', 'angeln', 'einigen', 'zucken', 'abonnieren', 'essen'];
  it.each(whole)('%s does not split', (verb) => {
    expect(splitSeparable(verb)).toBeUndefined();
  });

  it('keeps a verb that only looks separable in one piece', () => {
    expect(conjugate('zucken', 'du', 'present')).toBe('zuckst');
    expect(conjugate('angeln', 'ich', 'present')).toBe('angle');
    expect(conjugate('abonnieren', 'er', 'present')).toBe('abonniert');
  });

  const unknown: [string, string, string][] = [
    ['fahren', 'du', 'futur'],
    ['fahren', 'du', 'präteritum'],
    ['fahren', 'vos', 'present'],
    ['fahren', '', 'present'],
    ['', 'du', 'present'],
    ['Haus', 'du', 'present'],
    ['nicht gehen', 'du', 'present'],
    ['constructor', 'du', 'present'],
    ['fahren', 'constructor', 'present'],
    ['fahren', 'du', 'toString'],
    ['en', 'du', 'present'],
  ];
  it.each(unknown)('conjugate("%s", "%s", "%s") is undefined', (verb, person, tense) => {
    expect(conjugate(verb, person, tense)).toBeUndefined();
  });
});
