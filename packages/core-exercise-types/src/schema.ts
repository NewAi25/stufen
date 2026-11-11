// A very small JSON Schema checker. It understands only the keywords the
// exercise payload schemas in this box use: type, required, properties,
// additionalProperties false, items, minItems, minLength, minimum, enum, oneOf.
// It lets each grader check a payload against its own payloadSchema, so the
// schema and the grade time check cannot drift apart.

import type { JSONSchema } from '@stufen/contracts';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function typeMatches(type: unknown, value: unknown): boolean {
  switch (type) {
    case 'object':
      return isRecord(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    default:
      return true;
  }
}

/** Returns one line per problem. An empty list means the value fits the schema. */
export function checkSchema(schema: JSONSchema, value: unknown, path = 'payload'): string[] {
  const node: Record<string, unknown> = schema;
  const problems: string[] = [];

  if (node.type !== undefined && !typeMatches(node.type, value)) {
    return [`${path} must be of type ${String(node.type)}`];
  }
  if (Array.isArray(node.enum) && !node.enum.includes(value)) {
    problems.push(`${path} must be one of ${node.enum.map(String).join(', ')}`);
  }
  if (typeof value === 'string' && typeof node.minLength === 'number') {
    if (value.length < node.minLength) problems.push(`${path} must not be empty`);
  }
  if (typeof value === 'number' && typeof node.minimum === 'number') {
    if (value < node.minimum) problems.push(`${path} must be at least ${node.minimum}`);
  }
  if (Array.isArray(value)) problems.push(...checkArray(node, value, path));
  if (isRecord(value)) problems.push(...checkObject(node, value, path));
  if (Array.isArray(node.oneOf)) problems.push(...checkOneOf(node.oneOf, value, path));
  return problems;
}

function checkArray(node: Record<string, unknown>, value: unknown[], path: string): string[] {
  const problems: string[] = [];
  if (typeof node.minItems === 'number' && value.length < node.minItems) {
    problems.push(`${path} must have at least ${node.minItems} entries`);
  }
  if (isRecord(node.items)) {
    const items = node.items;
    value.forEach((entry, index) => {
      problems.push(...checkSchema(items, entry, `${path}[${index}]`));
    });
  }
  return problems;
}

function checkObject(
  node: Record<string, unknown>,
  value: Record<string, unknown>,
  path: string,
): string[] {
  const problems: string[] = [];
  const properties = isRecord(node.properties) ? node.properties : {};
  if (Array.isArray(node.required)) {
    for (const key of node.required) {
      if (typeof key === 'string' && value[key] === undefined) {
        problems.push(`${path}.${key} is required`);
      }
    }
  }
  for (const [key, entry] of Object.entries(value)) {
    const child = properties[key];
    if (isRecord(child)) {
      if (entry !== undefined) problems.push(...checkSchema(child, entry, `${path}.${key}`));
    } else if (node.additionalProperties === false) {
      problems.push(`${path}.${key} is not an allowed field`);
    }
  }
  return problems;
}

function checkOneOf(options: unknown[], value: unknown, path: string): string[] {
  const matching = options.filter(
    (option) => isRecord(option) && checkSchema(option, value, path).length === 0,
  );
  if (matching.length === 1) return [];
  return [`${path} must match exactly one of the ${options.length} allowed shapes`];
}
