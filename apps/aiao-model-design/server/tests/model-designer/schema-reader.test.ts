// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createSnapshotSchemaReader, parseIndexColumns } from '../../src/routes/model-designer/schema-reader';

describe('schema-reader', () => {
  it('parseIndexColumns extracts column list from CREATE INDEX def', () => {
    expect(parseIndexColumns('CREATE INDEX idx_users_email ON public.users USING btree (email)')).toEqual(['email']);
    expect(
      parseIndexColumns('CREATE UNIQUE INDEX idx_users_name_email ON public.users USING btree (name, email)')
    ).toEqual(['name', 'email']);
    expect(parseIndexColumns('CREATE INDEX idx_q ON public.t USING btree ("user-id", status)')).toEqual([
      'user-id',
      'status'
    ]);
  });

  it('createSnapshotSchemaReader returns fixed schema', async () => {
    const remote = {
      tables: [
        {
          name: 'users',
          columns: [{ name: 'id', type: 'uuid', nullable: false, primaryKey: true }],
          foreignKeys: [],
          indexes: []
        }
      ]
    };
    const reader = createSnapshotSchemaReader(remote);
    await expect(reader()).resolves.toEqual(remote);
    await expect(reader()).resolves.toEqual(remote);
  });
});
