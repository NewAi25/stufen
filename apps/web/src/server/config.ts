import 'server-only';

// Typed read of the environment. Server only. Local runs need no .env file:
// every value has a safe default outside production. In production a missing
// required secret stops the process with a message that names the variable.

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  /** Folder for core-storage files. */
  storageFsRoot: string;
  /** HMAC secret for signed file URLs. Null only outside production. */
  storageSigningSecret: string | null;
  /** Email of the automatic dev session. Always null in production. */
  devSessionEmail: string | null;
}

export type Env = Readonly<Record<string, string | undefined>>;

const DEFAULT_STORAGE_FS_ROOT = './.data/storage';
const DEFAULT_DEV_SESSION_EMAIL = 'dev@stufen.local';

/** Secrets that must be set when NODE_ENV is production. */
export const REQUIRED_IN_PRODUCTION = ['STORAGE_SIGNING_SECRET'] as const;

export class ConfigError extends Error {
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(
      `Missing required environment variable${missing.length === 1 ? '' : 's'} in production: ` +
        `${missing.join(', ')}. Set ${missing.length === 1 ? 'it' : 'them'} and start again. ` +
        'See .env.example at the repo root.',
    );
    this.name = 'ConfigError';
    this.missing = missing;
  }
}

function text(env: Env, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

function nodeEnvOf(env: Env): AppConfig['nodeEnv'] {
  const value = text(env, 'NODE_ENV');
  if (value === 'production' || value === 'test') return value;
  return 'development';
}

/** Reads and checks the environment. Pass an object in tests. */
export function readConfig(env: Env = process.env): AppConfig {
  const nodeEnv = nodeEnvOf(env);
  const isProduction = nodeEnv === 'production';

  if (isProduction) {
    const missing = REQUIRED_IN_PRODUCTION.filter((name) => text(env, name) === null);
    if (missing.length > 0) throw new ConfigError(missing);
  }

  return {
    nodeEnv,
    isProduction,
    storageFsRoot: text(env, 'STORAGE_FS_ROOT') ?? DEFAULT_STORAGE_FS_ROOT,
    storageSigningSecret: text(env, 'STORAGE_SIGNING_SECRET'),
    devSessionEmail: isProduction
      ? null
      : (text(env, 'STUFEN_DEV_SESSION_EMAIL') ?? DEFAULT_DEV_SESSION_EMAIL),
  };
}
