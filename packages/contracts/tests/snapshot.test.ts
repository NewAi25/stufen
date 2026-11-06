import { describe, expect, it } from 'vitest';
import type { CurriculumSnapshot } from '../src/index';

describe('CurriculumSnapshot', () => {
  it('holds candos, items and units with lessons and exercises', () => {
    const snapshot: CurriculumSnapshot = {
      language: 'de',
      version: '0.1.0',
      candos: [],
      items: [],
      units: [
        {
          id: 'u1',
          languageCode: 'de',
          level: 'A1',
          ordinal: 1,
          slug: 'hallo',
          title: 'Hallo',
          description: null,
          packVersion: '0.1.0',
          lessons: [
            {
              id: 'l1',
              unitId: 'u1',
              ordinal: 1,
              slug: 'begruessung',
              title: 'Begrüßung',
              kind: 'core',
              estimatedMinutes: 15,
              candoIds: [],
              packVersion: '0.1.0',
              exercises: [],
            },
          ],
        },
      ],
    };
    expect(snapshot.units[0]?.lessons[0]?.exercises).toEqual([]);
  });
});
