type SqliteRepositoryOptions = {
  repositories?: Record<string, unknown>;
};

export const GRAPH_REPOSITORY_NAME = 'GraphRepository' as const;

export function withSqliteRepository<TOptions extends SqliteRepositoryOptions>(
  options: TOptions,
  name: string,
  RepositoryClass: NonNullable<TOptions['repositories']>[string]
): TOptions {
  return {
    ...options,
    repositories: {
      ...options.repositories,
      [name]: RepositoryClass
    }
  } as TOptions;
}
