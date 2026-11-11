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
  /** Email of the automatic dev session. Null in production and in Postgres mode. */
  devSessionEmail: string | null;
  /** Where the boxes keep their data. Postgres when DATABASE_URL is set. */
  storeMode: StoreMode;
  /** Connection string for Postgres mode. Null in memory mode. */
  databaseUrl: string | null;
  /** Public base URL without a trailing slash. Sign in links are built from it. */
  appUrl: string;
  /** True when appUrl is https. The session cookie is then marked secure. */
  appUrlIsHttps: boolean;
  /** Folder that holds the language packs (STUFEN_CONTENT_DIR). Null: found automatically. */
  contentRoot: string | null;
  /** The variables core-mail reads. Passed to createMailFromEnv as they are. */
  mailEnv: Env;
}

export type StoreMode = 'postgres' | 'memory';

export type Env = Readonly<Record<string, string | undefined>>;

const DEFAULT_STORAGE_FS_ROOT = './.data/storage';
const DEFAULT_DEV_SESSION_EMAIL = 'dev@stufen.local';
const DEFAULT_PORT = '3000';
const LOCAL_HOSTS: readonly string[] = ['localhost', '127.0.0.1', '[::1]'];
const MAIL_VARIABLES = ['MAIL_DRIVER', 'SMTP_URL', 'MAIL_FROM', 'MAIL_REPLY_TO'] as const;

/** Values that must be set when NODE_ENV is production. */
export const REQUIRED_IN_PRODUCTION = ['STORAGE_SIGNING_SECRET', 'APP_URL'] as const;

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

/** A variable that is set but cannot be used. The message never repeats the value. */
export class ConfigValueError extends Error {
  readonly variable: string;

  constructor(variable: string, reason: string) {
    super(`Environment variable ${variable} is not usable: ${reason} See .env.example.`);
    this.name = 'ConfigValueError';
    this.variable = variable;
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

/** The public base URL: http or https, no credentials, no query, no trailing slash. */
function appUrlOf(env: Env, isProduction: boolean): URL {
  // Outside production the default follows PORT, so `PORT=3300 pnpm dev` sends
  // links that point at the server that is running.
  const port = text(env, 'PORT');
  const localDefault = `http://localhost:${port !== null && /^\d{1,5}$/.test(port) ? port : DEFAULT_PORT}`;
  const raw = text(env, 'APP_URL') ?? localDefault;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigValueError(
      'APP_URL',
      'it must be an absolute URL such as https://example.org.',
    );
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigValueError('APP_URL', 'it must start with http:// or https://.');
  }
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    throw new ConfigValueError('APP_URL', 'it must not carry credentials, a query or a fragment.');
  }
  // Over plain http the session cookie could not be marked Secure. Only a
  // local check of the production build may do without https.
  if (isProduction && url.protocol !== 'https:' && !LOCAL_HOSTS.includes(url.hostname)) {
    throw new ConfigValueError('APP_URL', 'in production it must start with https://.');
  }
  return url;
}

function storeModeOf(env: Env, databaseUrl: string | null): StoreMode {
  const forced = text(env, 'STUFEN_STORE');
  if (forced === 'memory') return 'memory';
  if (forced === 'postgres') {
    if (databaseUrl === null) {
      throw new ConfigValueError('STUFEN_STORE', 'postgres needs DATABASE_URL to be set.');
    }
    return 'postgres';
  }
  if (forced !== null) {
    throw new ConfigValueError('STUFEN_STORE', 'it must be memory or postgres, or left unset.');
  }
  return databaseUrl === null ? 'memory' : 'postgres';
}

/** Reads and checks the environment. Pass an object in tests. */
export function readConfig(env: Env = process.env): AppConfig {
  const nodeEnv = nodeEnvOf(env);
  const isProduction = nodeEnv === 'production';

  if (isProduction) {
    const missing = REQUIRED_IN_PRODUCTION.filter((name) => text(env, name) === null);
    if (missing.length > 0) throw new ConfigError(missing);
  }

  const configuredUrl = text(env, 'DATABASE_URL');
  const storeMode = storeModeOf(env, configuredUrl);
  const appUrl = appUrlOf(env, isProduction);
  const mailEnv: Record<string, string | undefined> = { NODE_ENV: nodeEnv };
  for (const name of MAIL_VARIABLES) mailEnv[name] = env[name];

  return {
    nodeEnv,
    isProduction,
    storageFsRoot: text(env, 'STORAGE_FS_ROOT') ?? DEFAULT_STORAGE_FS_ROOT,
    storageSigningSecret: text(env, 'STORAGE_SIGNING_SECRET'),
    // The dev session signs in without proof, so it exists only for local
    // work on the in memory stores. With a real database sign in is real.
    devSessionEmail:
      isProduction || storeMode !== 'memory'
        ? null
        : (text(env, 'STUFEN_DEV_SESSION_EMAIL') ?? DEFAULT_DEV_SESSION_EMAIL),
    storeMode,
    databaseUrl: storeMode === 'postgres' ? configuredUrl : null,
    // origin plus path, so a base path such as /app survives; never a trailing slash.
    appUrl: `${appUrl.origin}${appUrl.pathname}`.replace(/\/+$/, ''),
    appUrlIsHttps: appUrl.protocol === 'https:',
    contentRoot: text(env, 'STUFEN_CONTENT_DIR'),
    mailEnv,
  };
}
