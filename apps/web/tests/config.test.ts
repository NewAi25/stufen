import { describe, expect, it } from 'vitest';
import { ConfigError, readConfig, REQUIRED_IN_PRODUCTION } from '../src/server/config';

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
      STUFEN_DEV_SESSION_EMAIL: 'dev@stufen.local',
    });
    expect(config.isProduction).toBe(true);
    expect(config.storageSigningSecret).toBe('test-only-value');
    expect(config.devSessionEmail).toBeNull();
  });
});
