import { readConfig } from '../../src/server/config';
import type { AppConfig } from '../../src/server/config';

/**
 * Config for a container on the in memory stores. STUFEN_CONTENT_DIR is
 * passed through so a run can point at another copy of the content folder.
 */
export function memoryConfig(extra: Record<string, string | undefined> = {}): AppConfig {
  return readConfig({
    NODE_ENV: 'test',
    STUFEN_CONTENT_DIR: process.env.STUFEN_CONTENT_DIR,
    ...extra,
  });
}
