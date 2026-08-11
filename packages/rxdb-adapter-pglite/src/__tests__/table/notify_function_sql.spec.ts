import { describe, expect, it } from 'vitest';
import {
  generateNotifyFunctionSQL,
  generateNotifyInfrastructureSQL,
  generateNotifyTriggerSQL,
  removeNotifyTriggerSQL
} from '../../table/notify_function_sql.js';

describe('notify_function_sql', () => {
  it('generates reusable notify_change function SQL', () => {
    const sql = generateNotifyFunctionSQL();
    expect(sql).toContain('CREATE OR REPLACE FUNCTION notify_change()');
    expect(sql).toContain('pg_notify');
    expect(sql).toContain("TG_OP = 'DELETE'");
  });

  it('uses rxdb schema for system tables and public otherwise', () => {
    const system = generateNotifyTriggerSQL('rxdb_change');
    expect(system).toContain("schemaname = 'rxdb'");
    expect(system).toContain('"rxdb"."rxdb_change"');

    const publicTable = generateNotifyTriggerSQL('users');
    expect(publicTable).toContain("schemaname = 'public'");
    expect(publicTable).toContain('"public"."users"');
  });

  it('removes triggers with matching schema', () => {
    expect(removeNotifyTriggerSQL('rxdb_branch')).toContain('"rxdb"."rxdb_branch"');
    expect(removeNotifyTriggerSQL('orders')).toContain('"public"."orders"');
  });

  it('builds full infrastructure with default and custom watch tables', () => {
    const defaults = generateNotifyInfrastructureSQL();
    expect(defaults).toContain('notify_change()');
    expect(defaults).toContain('rxdb_change_notify_trigger');
    expect(defaults).toContain('rxdb_branch_notify_trigger');
    expect(defaults).toContain('rxdb_migration_notify_trigger');

    const custom = generateNotifyInfrastructureSQL(['custom_table']);
    expect(custom).toContain('custom_table_notify_trigger');
    expect(custom).not.toContain('rxdb_change_notify_trigger');
  });
});
