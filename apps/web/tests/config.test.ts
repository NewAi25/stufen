import { describe, expect, it } from 'vitest';
import {
  ConfigError,
  ConfigValueError,
  readConfig,
  REQUIRED_IN_PRODUCTION,
} from '../src/server/config';

describe('readConfig', () => {
  it('uses safe defaults outside production', () => {
    const config = readConfig({});
    expect(config.nodeEnv).toBe('development');
    expect(config.isProduction).toBe(false);
    expect(config.storageFsRoot).toBe('./.data/storage');
    expect(config.storageSigningSecret).toBeNull();
    expect(config.devSessionEmail).toBe('dev@stufen.local');
  });

  it('reads overrides from the environment', () => {
    const config = readConfig({
      NODE_ENV: 'test',
      STORAGE_FS_ROOT: '/tmp/files',
      STUFEN_DEV_SESSION_EMAIL: 'me@example.test',
    });
    expect(config.nodeEnv).toBe('test');
    expect(config.storageFsRoot).toBe('/tmp/files');
    expect(config.devSessionEmail).toBe('me@example.test');
  });

  it('throws in production when a required secret is missing', () => {
    expect(() => readConfig({ NODE_ENV: 'production' })).toThrow(ConfigError);
    expect(() => readConfig({ NODE_ENV: 'production' })).toThrow(/STORAGE_SIGNING_SECRET/);
  });

  it('treats a blank secret as missing and names every missing variable', () => {
    try {
      readConfig({ NODE_ENV: 'production', STORAGE_SIGNING_SECRET: '   ' });
      expect.unreachable('readConfig should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).missing).toEqual([...REQUIRED_IN_PRODUCTION]);
    }
  });

  it('passes in production with the secrets set and never has a dev session', () => {
    const config = readConfig({
      NODE_ENV: 'production',
      STORAGE_SIGNING_SECRET: 'test-only-value',
      APP_URL: 'https://stufen.example.test',
      STUFEN_DEV_SESSION_EMAIL: 'dev@stufen.local',
    });
    expect(config.isProduction).toBe(true);
    expect(config.storageSigningSecret).toBe('test-only-value');
    expect(config.devSessionEmail).toBeNull();
  });
});

describe('readConfig: store mode, APP_URL and mail', () => {
  it('uses memory without DATABASE_URL and postgres with it', () => {
    expect(readConfig({}).storeMode).toBe('memory');
    expect(readConfig({}).databaseUrl).toBeNull();
    const withDb = readConfig({ DATABASE_URL: 'postgres://u@localhost:5432/db' });
    expect(withDb.storeMode).toBe('postgres');
    expect(withDb.databaseUrl).toBe('postgres://u@localhost:5432/db');
  });

  it('lets STUFEN_STORE=memory win over DATABASE_URL', () => {
    const config = readConfig({
      DATABASE_URL: 'postgres://u@localhost:5432/db',
      STUFEN_STORE: 'memory',
    });
    expect(config.storeMode).toBe('memory');
    expect(config.databaseUrl).toBeNull();
    expect(config.devSessionEmail).toBe('dev@stufen.local');
  });

  it('has no dev session in postgres mode, also outside production', () => {
    const config = readConfig({
      DATABASE_URL: 'postgres://u@localhost:5432/db',
      STUFEN_DEV_SESSION_EMAIL: 'me@example.test',
    });
    expect(config.devSessionEmail).toBeNull();
  });

  it('refuses an unknown STUFEN_STORE and postgres without a URL', () => {
    expect(() => readConfig({ STUFEN_STORE: 'sqlite' })).toThrow(ConfigValueError);
    expect(() => readConfig({ STUFEN_STORE: 'postgres' })).toThrow(/DATABASE_URL/);
  });

  it('defaults APP_URL locally, trims the trailing slash and detects https', () => {
    expect(readConfig({}).appUrl).toBe('http://localhost:3000');
    expect(readConfig({}).appUrlIsHttps).toBe(false);
    expect(readConfig({ PORT: '3300' }).appUrl).toBe('http://localhost:3300');
    expect(readConfig({ PORT: 'abc' }).appUrl).toBe('http://localhost:3000');
    expect(readConfig({ PORT: '3300', APP_URL: 'http://localhost:4000' }).appUrl).toBe(
      'http://localhost:4000',
    );
    const config = readConfig({ APP_URL: 'https://stufen.example.test/' });
    expect(config.appUrl).toBe('https://stufen.example.test');
    expect(config.appUrlIsHttps).toBe(true);
  });

  it('requires APP_URL in production and refuses a value that is not a plain web URL', () => {
    expect(() => readConfig({ NODE_ENV: 'production', STORAGE_SIGNING_SECRET: 'x' })).toThrow(
      /APP_URL/,
    );
    for (const bad of ['stufen.example.test', 'ftp://example.test', 'https://a:b@example.test']) {
      expect(() => readConfig({ APP_URL: bad })).toThrow(ConfigValueError);
    }
  });

  it('insists on https in production, except for a local check', () => {
    const production = { NODE_ENV: 'production', STORAGE_SIGNING_SECRET: 'x' };
    expect(() => readConfig({ ...production, APP_URL: 'http://stufen.example.test' })).toThrow(
      /https/,
    );
    expect(readConfig({ ...production, APP_URL: 'http://localhost:3000' }).appUrlIsHttps).toBe(
      false,
    );
    expect(
      readConfig({ ...production, APP_URL: 'https://stufen.example.test' }).appUrlIsHttps,
    ).toBe(true);
    // Outside production plain http is fine, for example on a LAN address.
    expect(readConfig({ APP_URL: 'http://192.168.0.10:3000' }).appUrl).toBe(
      'http://192.168.0.10:3000',
    );
  });

  it('never repeats a refused value in the error message', () => {
    try {
      readConfig({ APP_URL: 'https://user:hunter2@example.test' });
      expect.unreachable('readConfig should have thrown');
    } catch (error) {
      expect((error as Error).message).not.toContain('hunter2');
    }
  });

  it('hands the mail variables on without reading them', () => {
    const config = readConfig({ MAIL_DRIVER: 'smtp', SMTP_URL: 'smtp://localhost:1025' });
    expect(config.mailEnv).toMatchObject({
      NODE_ENV: 'development',
      MAIL_DRIVER: 'smtp',
      SMTP_URL: 'smtp://localhost:1025',
    });
  });
});
