import type { RxDB } from '@aiao/rxdb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BulkSyncResult } from '../bulk-sync.js';
import { createTestDBWithRemote } from './fixtures/test-db-setup.js';

const emptyBulkSyncResult = (): BulkSyncResult => ({
  succeeded: 0,
  failed: 0,
  results: [],
  durationMs: 0
});

describe('SyncManager.push batchSize forwarding', () => {
  let rxdb: RxDB;

  beforeEach(async () => {
    ({ rxdb } = await createTestDBWithRemote());
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rxdb.disconnectAll();
  });

  it('forwards an explicit batchSize to bulkSync push options unchanged', async () => {
    const bulkSync = vi.spyOn(rxdb.syncManager, 'bulkSync').mockResolvedValue(emptyBulkSyncResult());

    await rxdb.syncManager.push({ batchSize: 0 });

    expect(bulkSync.mock.calls[0]?.[0]?.push?.batchSize).toBe(0);
  });

  it('omits bulkSync push options when batchSize is undefined', async () => {
    const bulkSync = vi.spyOn(rxdb.syncManager, 'bulkSync').mockResolvedValue(emptyBulkSyncResult());

    await rxdb.syncManager.push();

    expect(bulkSync.mock.calls[0]?.[0]).not.toHaveProperty('push');
  });
});
