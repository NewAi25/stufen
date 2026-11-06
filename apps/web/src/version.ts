import pkg from '../package.json';

/** The apps/web version, read from package.json so there is one place to bump. */
export const APP_VERSION: string = pkg.version;
