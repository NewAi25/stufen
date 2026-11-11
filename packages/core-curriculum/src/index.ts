// @stufen/core-curriculum
// The CEFR spine: levels, can do descriptors, units and lessons as a graph.
// This file is the only public surface of the box. Everything exported here
// is listed in docs/04-module-contracts.md. Nothing else in src/ is public.
// Status: see the core-curriculum row in docs/07-build-sequence.md.

export { createCurriculum, CurriculumNotFoundError } from './curriculum';
export { createInMemoryCurriculumStore } from './store';
export type { CurriculumStore, CurriculumWriter } from './store';
