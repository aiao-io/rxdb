import { describe, expect, it } from 'vitest';

import {
  NetworkOfflineError,
  RxDBCheckViolationError,
  RxDBConstraintDriftError,
  RxDBExclusionViolationError,
  RxDBLocalAdapterCapabilityError,
  RxDBMissingPluginError,
  RxDBPartialSyncError,
  RxDBPluginAmbiguousDependencyError,
  RxDBPluginDependencyCycleError,
  RxDBQueryCacheCapabilityError,
  RxDBReadOnlyError
} from '../RxDBError.js';

const cases = [
  ['RxDBPartialSyncError', new RxDBPartialSyncError({}, new Error('failed')), 'RXDB_PARTIAL_SYNC'],
  [
    'RxDBQueryCacheCapabilityError',
    new RxDBQueryCacheCapabilityError('Todo', 'local', ['upsertMany']),
    'RXDB_QUERY_CACHE_CAPABILITY_MISSING'
  ],
  [
    'RxDBLocalAdapterCapabilityError',
    new RxDBLocalAdapterCapabilityError('sqlite', ['migrateSystemSchema']),
    'RXDB_LOCAL_ADAPTER_CAPABILITY_MISSING'
  ],
  [
    'RxDBMissingPluginError',
    new RxDBMissingPluginError('Todo', 'querycache', '@aiao/plugin', 'rxdb.use()'),
    'RXDB_PLUGIN_MISSING'
  ],
  ['RxDBReadOnlyError', new RxDBReadOnlyError('create', 'Todo'), 'RXDB_READ_ONLY'],
  ['NetworkOfflineError', new NetworkOfflineError(new Error('offline')), 'RXDB_NETWORK_OFFLINE'],
  [
    'RxDBPluginDependencyCycleError',
    new RxDBPluginDependencyCycleError(['a', 'b', 'a']),
    'RXDB_PLUGIN_DEPENDENCY_CYCLE'
  ],
  [
    'RxDBCheckViolationError',
    new RxDBCheckViolationError('Todo', 'ck_todo', [], new Error('constraint')),
    'RXDB_CHECK_VIOLATION'
  ],
  [
    'RxDBExclusionViolationError',
    new RxDBExclusionViolationError('Todo', 'ex_todo', [], new Error('constraint')),
    'RXDB_EXCLUSION_VIOLATION'
  ],
  ['RxDBConstraintDriftError', new RxDBConstraintDriftError('Todo', 'todo', [], []), 'RXDB_CONSTRAINT_DRIFT'],
  [
    'RxDBPluginAmbiguousDependencyError',
    new RxDBPluginAmbiguousDependencyError('plugin:search', ['A', 'B']),
    'RXDB_PLUGIN_AMBIGUOUS_DEPENDENCY'
  ]
] as const;

describe('RxDB error codes', () => {
  it.each(cases)('%s exposes a stable code', (_name, error, code) => {
    expect(error.code).toBe(code);
  });
});
