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
};

export default nextConfig;
