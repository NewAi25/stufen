import 'server-only';

import fs from 'node:fs';
import path from 'node:path';

// Where the content packs live on disk. lang-de finds content/de relative to
// its own source file, which is right under tsx and Vitest. A bundler may hand
// that file another location, so the app looks for the folder itself and
// passes the answer to the pack.

const MARKER = 'pack.json';

function holdsPack(dir: string): boolean {
  return fs.existsSync(path.join(dir, MARKER));
}

/**
 * The folder of one language pack, for example <repo>/content/de.
 *
 * Order: `configuredRoot` (STUFEN_CONTENT_DIR, the folder that holds the
 * language folders), then `packDefault` (what the lang box computes), then
 * the first `content/<language>` found walking up from `startDir`.
 * Throws an error that names STUFEN_CONTENT_DIR when none of them holds a pack.
 */
export function resolvePackDir(
  language: string,
  options: { configuredRoot: string | null; packDefault: string; startDir?: string },
): string {
  if (options.configuredRoot !== null) {
    const dir = path.resolve(options.configuredRoot, language);
    if (holdsPack(dir)) return dir;
    throw new Error(
      `STUFEN_CONTENT_DIR does not hold a ${language} pack: ${path.join(dir, MARKER)} is missing.`,
    );
  }
  if (holdsPack(options.packDefault)) return path.resolve(options.packDefault);

  // The comment keeps the bundler from tracing every folder above the app.
  let current = path.resolve(/*turbopackIgnore: true*/ options.startDir ?? process.cwd());
  for (;;) {
    const candidate = path.join(current, 'content', language);
    if (holdsPack(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(
    `The ${language} content pack was not found. Set STUFEN_CONTENT_DIR to the folder that ` +
      `holds the language folders, for example the content folder of the repo.`,
  );
}
