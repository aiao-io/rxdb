import type { SqliteOptions } from '@aiao/rxdb-adapter-sqlite-wasm';

export const GRAPH_REPOSITORY_NAME = 'GraphRepository' as const;

export function withSqliteWasmRepository(
  options: SqliteOptions,
  name: string,
  RepositoryClass: NonNullable<SqliteOptions['repositories']>[string]
): SqliteOptions {
  return {
    ...options,
    repositories: {
      ...options.repositories,
      [name]: RepositoryClass
    }
  };
}
