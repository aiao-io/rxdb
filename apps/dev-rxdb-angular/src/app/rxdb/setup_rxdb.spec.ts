import { describe, expect, it } from 'vitest';
import { GRAPH_REPOSITORY_NAME, withSqliteRepository } from './sqlite-repositories';

interface TestOptions {
  opfs: boolean;
  repositories?: Record<string, unknown>;
}

describe('withSqliteRepository', () => {
  it('应该注入 GraphRepository 的 sqlite 实现', () => {
    const graphRepository = class {};
    const options: TestOptions = {
      opfs: false
    };

    const configured = withSqliteRepository(options, GRAPH_REPOSITORY_NAME, graphRepository);

    expect(configured.repositories?.GraphRepository).toBe(graphRepository);
  });

  it('应该保留已有 repositories 配置', () => {
    const existingRepository = class {};
    const graphRepository = class {};
    const options: TestOptions = {
      opfs: false,
      repositories: {
        ExistingRepository: existingRepository
      }
    };

    const configured = withSqliteRepository(options, GRAPH_REPOSITORY_NAME, graphRepository);

    expect(configured.repositories).toMatchObject({
      ExistingRepository: existingRepository,
      GraphRepository: graphRepository
    });
  });
});
