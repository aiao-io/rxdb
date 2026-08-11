import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @nx/enforce-module-boundaries -- 包名 consumer 门禁必须验证发布入口
import {
  buildBackfillSql,
  buildFieldContainsSql,
  buildFieldMatchExpression,
  buildFieldSearchSql,
  buildResetFtsSql,
  buildSourceRowCountSql,
  createSearchEngine,
  createSearchState,
  installFtsForEntity
} from '@aiao/rxdb-plugin-search';
// eslint-disable-next-line @nx/enforce-module-boundaries -- 包名 consumer 门禁必须验证发布入口
import type {
  FtsExecutor,
  FtsInstallPlan,
  InstallFtsResult,
  MigrationRecordStore,
  RuntimeSqlExecutor,
  SearchEngine,
  SearchEngineQuery,
  SearchStateMachine,
  SearchStateSnapshot
} from '@aiao/rxdb-plugin-search';

describe('search package root public API', () => {
  it('exports runtime engine, installer and state symbols through the package root', () => {
    expect(buildFieldSearchSql).toBeTypeOf('function');
    expect(buildFieldMatchExpression).toBeTypeOf('function');
    expect(buildFieldContainsSql).toBeTypeOf('function');
    expect(buildSourceRowCountSql).toBeTypeOf('function');
    expect(buildResetFtsSql).toBeTypeOf('function');
    expect(buildBackfillSql).toBeTypeOf('function');
    expect(createSearchEngine).toBeTypeOf('function');
    expect(installFtsForEntity).toBeTypeOf('function');
    expect(createSearchState).toBeTypeOf('function');
  });

  it('keeps the exported structural types usable by strict consumers', async () => {
    const executor: FtsExecutor = async () => [];
    const engine: SearchEngine = createSearchEngine(executor);
    const query: SearchEngineQuery = {
      table: 'article',
      entity: 'Article',
      primaryKey: 'id',
      fields: ['title'],
      compiled: null,
      pageSize: 10,
      offset: 0
    };
    const state: SearchStateMachine = createSearchState();
    const snapshot: SearchStateSnapshot = state.snapshot();
    const plan = null as unknown as FtsInstallPlan;
    const result = null as unknown as InstallFtsResult;
    const store = null as unknown as MigrationRecordStore;
    const runtime = null as unknown as RuntimeSqlExecutor;

    await expect(engine.search(query)).resolves.toEqual([]);
    expect(snapshot.state).toBe('idle');
    expect(plan).toBeNull();
    expect(result).toBeNull();
    expect(store).toBeNull();
    expect(runtime).toBeNull();
    state.destroy();
  });
});
