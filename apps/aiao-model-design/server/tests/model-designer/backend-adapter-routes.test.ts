// @vitest-environment node
import { Elysia } from 'elysia';
import { describe, expect, it } from 'vitest';
import { createModelDesignerRoutes } from '../../src/routes/model-designer/routes';
import { createMockSqlExecutor } from '../../src/routes/model-designer/sql-executor';

const AUTHORIZATION = { authorization: 'Bearer model-designer-dev-token' };

function validationApp() {
  return new Elysia().group('/api', app =>
    app.use(
      createModelDesignerRoutes({
        backendAdapterId: 'validation',
        executor: createMockSqlExecutor(),
        schemaReader: null
      })
    )
  );
}

describe('backend adapter routes', () => {
  it('exposes the selected Supabase descriptor', async () => {
    const app = new Elysia().group('/api', child =>
      child.use(
        createModelDesignerRoutes({
          backendAdapterId: 'supabase',
          executor: createMockSqlExecutor(),
          schemaReader: async () => ({ tables: [] })
        })
      )
    );

    const response = await app.handle(new Request('http://localhost/api/model-designer/backend'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: 'supabase',
      capabilities: ['schema.read', 'schema.diff', 'ddl.dry-run', 'ddl.execute']
    });
  });

  it('selects validation and rejects schema read with 501', async () => {
    const app = validationApp();
    const descriptor = await app.handle(new Request('http://localhost/api/model-designer/backend'));
    expect(await descriptor.json()).toEqual({ id: 'validation', label: 'Validation', capabilities: [] });

    const response = await app.handle(
      new Request('http://localhost/api/model-designer/sql/remote-schema', { headers: AUTHORIZATION })
    );
    expect(response.status).toBe(501);
    expect(await response.json()).toMatchObject({ ok: false, error: 'capability_unavailable' });
  });

  it('rejects validation DDL without invoking the legacy executor', async () => {
    const log: Array<{ sql: string; commit: boolean }> = [];
    const app = new Elysia().group('/api', child =>
      child.use(
        createModelDesignerRoutes({
          backendAdapterId: 'validation',
          executor: createMockSqlExecutor(log),
          schemaReader: null
        })
      )
    );
    const response = await app.handle(
      new Request('http://localhost/api/model-designer/sql/execute', {
        method: 'POST',
        headers: { ...AUTHORIZATION, 'content-type': 'application/json' },
        body: JSON.stringify({ sql: 'CREATE TABLE should_not_run (id uuid);' })
      })
    );

    expect(response.status).toBe(501);
    expect(await response.json()).toMatchObject({ ok: false, error: 'capability_unavailable' });
    expect(log).toHaveLength(0);
  });

  it('fails fast when startup configuration selects an unknown adapter', () => {
    expect(() =>
      createModelDesignerRoutes({
        backendAdapterId: 'missing',
        executor: createMockSqlExecutor(),
        schemaReader: null
      })
    ).toThrowError(/unknown/i);
  });
});
