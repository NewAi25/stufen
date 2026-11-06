// Stand in for the `server-only` package under Vitest. The real package
// throws unless the bundler sets the react-server condition, which Next does
// and Vitest does not. Aliased in the root vitest.config.ts.
export {};
