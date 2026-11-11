// validatePackData (P1-02): one broken variant of the fixture per rule.
// Acceptance check from docs/07-build-sequence.md: a pack with a dangling
// `item_ids` entry fails validation with the id in the report.
import { describe, expect, it } from 'vitest';
import type { CefrLevel, ExerciseTypeId, LanguagePack, LessonInput } from '@stufen/contracts';
import { validatePackData } from '../src/index';
import type { PackIssue } from '../src/index';
import { makePack, makePackData, toPack } from './helpers/pack';
import type { PackData } from './helpers/pack';

/** First lesson of the first unit, as listed in the fixture. */
function firstLesson(data: PackData): LessonInput {
  const lesson = data.units[0]?.lessons[0];
  if (!lesson) throw new Error('the fixture has no lesson');
  return lesson;
}

function errorsOf(pack: LanguagePack): PackIssue[] {
  const report = validatePackData(pack);
  expect(report.ok).toBe(report.errors.length === 0);
  return report.errors;
}

/** The single error a broken variant must produce. */
function onlyError(change: (data: PackData) => void): PackIssue {
  const errors = errorsOf(makePack(change));
  expect(errors).toHaveLength(1);
  const [issue] = errors;
  if (!issue) throw new Error('expected one error');
  expect(issue.severity).toBe('error');
  return issue;
}

describe('validatePackData on the valid fixture', () => {
  it('reports no error and no warning', () => {
    const report = validatePackData(makePack());

    expect(report).toEqual({
      language: 'nl',
      version: '0.1.0',
      ok: true,
      errors: [],
      warnings: [],
    });
  });

  it('does not change the pack and gives the same report twice', () => {
    const data = makePackData();
    const before = structuredClone(data);
    const pack = toPack(data);

    expect(validatePackData(pack)).toEqual(validatePackData(pack));
    expect(data).toEqual(before);
  });
});

describe('manifest rules', () => {
  it('the manifest code must equal the pack code', () => {
    const data = makePackData();
    data.manifest.code = 'fr';

    const errors = errorsOf(toPack(data, 'nl'));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ severity: 'error', file: 'pack.json', path: 'code' });
    expect(errors[0]?.message).toContain('"fr"');
  });

  it('the manifest version must equal the pack version', () => {
    const data = makePackData();
    const pack = { ...toPack(data), version: '9.9.9' };

    const errors = errorsOf(pack);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ file: 'pack.json', path: 'version' });
  });

  it('a manifest level that is not a CEFR level is an error', () => {
    const issue = onlyError((data) => {
      data.manifest.levels = ['A1', 'A0' as CefrLevel];
    });

    expect(issue).toMatchObject({ file: 'pack.json', path: 'levels[1]' });
  });

  it('a pending checksum is a warning, a missing one an error', () => {
    const pending = validatePackData(
      makePack((data) => {
        data.manifest.checksum = 'pending';
      }),
    );
    expect(pending.ok).toBe(true);
    expect(pending.warnings).toEqual([
      expect.objectContaining({ severity: 'warning', file: 'pack.json', path: 'checksum' }),
    ]);

    const missing = onlyError((data) => {
      data.manifest.checksum = '';
    });
    expect(missing).toMatchObject({ file: 'pack.json', path: 'checksum' });
  });

  it('a loader that throws becomes an error in the report', () => {
    const pack: LanguagePack = {
      ...makePack(),
      loadItems: () => {
        throw new Error('disk on fire');
      },
    };

    const report = validatePackData(pack);

    expect(report.ok).toBe(false);
    expect(report.errors[0]).toMatchObject({ file: 'items', severity: 'error' });
    expect(report.errors[0]?.message).toContain('disk on fire');
  });
});

describe('keys are unique across the pack', () => {
  it('a duplicate descriptor key is an error', () => {
    const issue = onlyError((data) => {
      const [first] = data.candos;
      if (first) data.candos.push({ ...first });
    });

    expect(issue.file).toBe('candos/A1.json');
    expect(issue.message).toContain('duplicate key nl:cando:A1.VOC.01');
  });

  it('a duplicate item key is an error', () => {
    const issue = onlyError((data) => {
      const [first] = data.items;
      if (first) data.items.push({ ...first });
    });

    expect(issue).toMatchObject({ file: 'items/A1.jsonl', path: 'items[nl:vocab:hallo]' });
    expect(issue.message).toContain('duplicate key nl:vocab:hallo');
  });

  it('a duplicate unit key is an error', () => {
    const issue = onlyError((data) => {
      const [first, second] = data.units;
      if (!first || !second) throw new Error('the fixture has two units');
      second.key = first.key;
      for (const lesson of second.lessons) lesson.unit_key = first.key;
    });

    expect(issue.message).toContain('duplicate key nl:unit:a1-01-hallo');
  });

  it('a duplicate lesson key is an error, also across units', () => {
    const issue = onlyError((data) => {
      const other = data.units[1]?.lessons[0];
      if (other) other.key = firstLesson(data).key;
    });

    expect(issue.message).toContain('duplicate key nl:lesson:a1-01-02');
    expect(issue.path).toBe('units[nl:unit:a1-02-familie].lessons[nl:lesson:a1-01-02]');
  });

  it('a duplicate exercise key is an error, also across lessons', () => {
    const issue = onlyError((data) => {
      const other = data.units[1]?.lessons[0]?.exercises[0];
      const mine = firstLesson(data).exercises[0];
      if (other && mine) other.key = mine.key;
    });

    expect(issue.message).toContain('duplicate key nl:exercise:a1-01-02-01');
  });

  it('a key shared by two kinds of record is an error', () => {
    const issue = onlyError((data) => {
      const [firstItem] = data.items;
      const unit = data.units[1];
      if (!firstItem || !unit) throw new Error('fixture');
      unit.key = firstItem.key;
      for (const lesson of unit.lessons) lesson.unit_key = firstItem.key;
    });

    expect(issue.message).toContain(
      'duplicate key nl:vocab:hallo, already used by items[nl:vocab:hallo]',
    );
  });

  it('a key of another language and a descriptor key that is not its code are errors', () => {
    const foreign = onlyError((data) => {
      const item = data.items[2];
      if (!item) throw new Error('fixture');
      item.key = 'de:vocab:ja';
      const exercise = data.units[1]?.lessons[0]?.exercises[0];
      if (exercise) exercise.item_ids = ['de:vocab:ja'];
    });
    expect(foreign.message).toContain('does not start with "nl:"');

    const errors = errorsOf(
      makePack((data) => {
        const cando = data.candos[0];
        if (cando) cando.code = 'A1.VOC.99';
      }),
    );
    expect(errors).toEqual([
      expect.objectContaining({ path: 'candos[nl:cando:A1.VOC.01].key', severity: 'error' }),
    ]);
  });

  it('an item without a key is an error', () => {
    const issue = onlyError((data) => {
      const [first] = data.items;
      if (first) data.items.push({ ...first, key: '' });
    });

    expect(issue.message).toBe('the record has no key');
  });
});

describe('references resolve', () => {
  it('every lesson targets at least one descriptor', () => {
    const issue = onlyError((data) => {
      const lesson = data.units[1]?.lessons[0];
      if (lesson) lesson.cando_ids = [];
    });

    expect(issue).toMatchObject({
      file: 'units/A1/02-familie/lesson-01.json',
      path: 'units[nl:unit:a1-02-familie].lessons[nl:lesson:a1-02-01].cando_ids',
      message: 'the lesson targets no descriptor',
    });
  });

  it('a descriptor key in a lesson that does not exist is an error', () => {
    const issue = onlyError((data) => {
      firstLesson(data).cando_ids.push('nl:cando:A1.WRI.77');
    });

    expect(issue.path).toBe('units[nl:unit:a1-01-hallo].lessons[nl:lesson:a1-01-02].cando_ids[2]');
    expect(issue.message).toContain('nl:cando:A1.WRI.77');
  });

  it('an introduced item that does not exist is an error', () => {
    const issue = onlyError((data) => {
      firstLesson(data).introduces_item_ids = ['nl:vocab:hallo', 'nl:vocab:spook'];
    });

    expect(issue.path).toMatch(/introduces_item_ids\[1\]$/);
    expect(issue.message).toContain('nl:vocab:spook');
  });

  it('a descriptor key in an exercise that does not exist is an error', () => {
    const issue = onlyError((data) => {
      const exercise = firstLesson(data).exercises[0];
      if (exercise) exercise.cando_ids = ['nl:cando:A1.REA.01', 'nl:cando:A9.XXX.01'];
    });

    expect(issue.path).toMatch(/exercises\[nl:exercise:a1-01-02-01\]\.cando_ids\[1\]$/);
    expect(issue.message).toContain('nl:cando:A9.XXX.01');
  });

  it('acceptance: a dangling item_ids entry fails validation with the id in the report', () => {
    const report = validatePackData(
      makePack((data) => {
        firstLesson(data).exercises[0]?.item_ids.push('nl:vocab:gibt-es-nicht');
      }),
    );

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual([
      {
        severity: 'error',
        file: 'units/A1/01-hallo/lesson-02.json',
        path: 'units[nl:unit:a1-01-hallo].lessons[nl:lesson:a1-01-02].exercises[nl:exercise:a1-01-02-01].item_ids[1]',
        message: 'item nl:vocab:gibt-es-nicht does not exist in the pack',
      },
    ]);
  });

  it('an exercise must target a descriptor, and a lesson must name its own unit', () => {
    const noCando = onlyError((data) => {
      const exercise = firstLesson(data).exercises[0];
      if (exercise) exercise.cando_ids = [];
    });
    expect(noCando.message).toBe('the exercise targets no descriptor');

    const wrongUnit = onlyError((data) => {
      firstLesson(data).unit_key = 'nl:unit:a1-02-familie';
    });
    expect(wrongUnit.path).toMatch(/\.unit_key$/);
  });
});

describe('types and levels', () => {
  it('an exercise type that is not registered in contracts is an error', () => {
    const issue = onlyError((data) => {
      const exercise = firstLesson(data).exercises[0];
      if (exercise) exercise.type = 'crossword' as ExerciseTypeId;
    });

    expect(issue.path).toMatch(/exercises\[nl:exercise:a1-01-02-01\]\.type$/);
    expect(issue.message).toContain('"crossword"');
  });

  it.each([
    [
      'descriptor',
      (data: PackData) => void (data.candos[1] && (data.candos[1].level = 'A0' as CefrLevel)),
      'candos[nl:cando:A1.LIS.01].level',
    ],
    [
      'item',
      (data: PackData) => void (data.items[1] && (data.items[1].level = 'D1' as CefrLevel)),
      'items[nl:vocab:dag].level',
    ],
    [
      'unit',
      (data: PackData) => void (data.units[1] && (data.units[1].level = 'a1' as CefrLevel)),
      'units[nl:unit:a1-02-familie].level',
    ],
  ])('a %s level that is not a CEFR level is an error', (_kind, change, path) => {
    const issue = onlyError(change);

    expect(issue.path).toBe(path);
    expect(issue.message).toContain('is not a CEFR level');
  });
});

describe('ordinals and slugs are unique within their parent', () => {
  it('two units of one level with the same ordinal are an error', () => {
    const issue = onlyError((data) => {
      const unit = data.units[1];
      if (unit) unit.ordinal = 1;
    });

    expect(issue.path).toBe('units[nl:unit:a1-02-familie].ordinal');
    expect(issue.message).toContain('ordinal 1 is used twice in level A1');
  });

  it('the same unit ordinal in two levels is fine', () => {
    const report = validatePackData(
      makePack((data) => {
        const unit = data.units[1];
        if (!unit) throw new Error('fixture');
        unit.level = 'A2';
        unit.ordinal = 1;
      }),
    );

    expect(report.errors).toEqual([]);
  });

  it('two lessons of one unit with the same ordinal are an error', () => {
    const issue = onlyError((data) => {
      firstLesson(data).ordinal = 1;
    });

    expect(issue.path).toBe('units[nl:unit:a1-01-hallo].lessons[nl:lesson:a1-01-01].ordinal');
    expect(issue.message).toContain('unit nl:unit:a1-01-hallo');
  });

  it('two exercises of one lesson with the same ordinal are an error', () => {
    const issue = onlyError((data) => {
      const exercise = data.units[0]?.lessons[1]?.exercises[0];
      if (exercise) exercise.ordinal = 1;
    });

    expect(issue.path).toMatch(/exercises\[nl:exercise:a1-01-01-01\]\.ordinal$/);
    expect(issue.message).toContain('lesson nl:lesson:a1-01-01');
  });

  it('an ordinal that is not a whole number from 1 is an error', () => {
    for (const bad of [0, 1.5, -2]) {
      const issue = onlyError((data) => {
        const exercise = data.units[1]?.lessons[0]?.exercises[0];
        if (exercise) exercise.ordinal = bad;
      });
      expect(issue.path).toMatch(/\.ordinal$/);
    }
  });

  it('a unit slug used twice, or a lesson slug used twice in a unit, is an error', () => {
    const unitSlug = onlyError((data) => {
      const unit = data.units[1];
      if (unit) unit.slug = 'hallo';
    });
    expect(unitSlug.path).toBe('units[nl:unit:a1-02-familie].slug');

    const lessonSlug = onlyError((data) => {
      firstLesson(data).slug = 'hallo-dag';
    });
    expect(lessonSlug.path).toMatch(/\.slug$/);
  });
});

describe('warnings do not fail a pack', () => {
  it('a descriptor no lesson targets is a warning, not an error', () => {
    const report = validatePackData(
      makePack((data) => {
        const extra = data.candos[0];
        if (extra) data.candos.push({ ...extra, key: 'nl:cando:A1.WRI.01', code: 'A1.WRI.01' });
      }),
    );

    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([
      {
        severity: 'warning',
        file: 'candos/A1.json',
        path: 'candos[nl:cando:A1.WRI.01]',
        message: 'no lesson targets descriptor nl:cando:A1.WRI.01',
      },
    ]);
  });

  it('an item no lesson uses is a warning', () => {
    const report = validatePackData(
      makePack((data) => {
        const extra = data.items[0];
        if (extra) data.items.push({ ...extra, key: 'nl:vocab:nooit' });
      }),
    );

    expect(report.ok).toBe(true);
    expect(report.warnings.map((issue) => issue.message)).toEqual([
      'no lesson uses item nl:vocab:nooit',
    ]);
  });

  it('an exercise that targets a descriptor its lesson does not list is a warning', () => {
    const report = validatePackData(
      makePack((data) => {
        const exercise = data.units[1]?.lessons[0]?.exercises[0];
        if (exercise) exercise.cando_ids = ['nl:cando:A1.VOC.01', 'nl:cando:A1.LIS.01'];
      }),
    );

    expect(report.ok).toBe(true);
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]?.path).toMatch(/cando_ids\[1\]$/);
  });
});
