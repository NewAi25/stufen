// A shuffle that gives the same order for the same texts. The server render
// and the browser render must agree, so Math.random is not an option.
// Internal to the kit.

function hash(texts: readonly string[]): number {
  let h = 2166136261;
  for (const text of texts) {
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= 0x1f;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function generator(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The indexes 0 to n - 1 in a shuffled order that depends only on the texts.
 * With two or more items the result is never the original order.
 */
export function shuffledIndexes(texts: readonly string[]): number[] {
  const order = texts.map((_, index) => index);
  const random = generator(hash(texts));
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = order[i];
    const b = order[j];
    if (a !== undefined && b !== undefined) {
      order[i] = b;
      order[j] = a;
    }
  }
  const unchanged = order.every((value, index) => value === index);
  if (unchanged && order.length > 1) {
    const first = order.shift();
    if (first !== undefined) order.push(first);
  }
  return order;
}
