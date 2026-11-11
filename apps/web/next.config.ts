import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const appDir = path.dirname(fileURLToPath(import.meta.url));

// Every workspace box ships TypeScript source, so Next has to compile them.
const workspacePackages = [
  '@stufen/contracts',
  '@stufen/core-ai-tutor',
  '@stufen/core-analytics',
  '@stufen/core-assessment',
  '@stufen/core-auth',
  '@stufen/core-content',
  '@stufen/core-curriculum',
  '@stufen/core-entitlements',
  '@stufen/core-exercise-types',
  '@stufen/core-feedback',
  '@stufen/core-identity',
  '@stufen/core-lesson-engine',
  '@stufen/core-mail',
  '@stufen/core-progress',
  '@stufen/core-speech',
  '@stufen/core-srs',
  '@stufen/core-storage',
  '@stufen/db',
  '@stufen/lang-de',
  '@stufen/ui-kit',
];

const nextConfig: NextConfig = {
  output: 'standalone',
  // The monorepo root, so the standalone trace includes the workspace boxes.
  outputFileTracingRoot: path.join(appDir, '..', '..'),
  transpilePackages: workspacePackages,
  // The language packs are read from disk at run time (lang-de), so the
  // standalone output has to carry them. They land in standalone/content.
  // The dev server prints every request with its query string. The sign in
  // callback carries the one time token there, so it is left out of that log.
  logging: {
    incomingRequests: { ignore: [/^\/auth\/callback/] },
  },
  outputFileTracingIncludes: {
    '/**': ['../../content/de/**/*'],
  },
};

export default nextConfig;
