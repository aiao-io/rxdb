import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RxDB } from '../../RxDB.js';
import type { BulkSyncResult } from '../../version/bulk-sync.js';
import { createTestDBWithRemote } from '../fixtures/test-db-setup.js';

const emptyBulkSyncResult = (): BulkSyncResult => ({
  succeeded: 0,
  failed: 0,
  results: [],
  durationMs: 0
});

describe('VersionManager.push batchSize forwarding', () => {
  let rxdb: RxDB;

  beforeEach(async () => {
    ({ rxdb } = await createTestDBWithRemote());
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rxdb.disconnectAll();
  });

  it('forwards an explicit batchSize to bulkSync push options unchanged', async () => {
    const bulkSync = vi.spyOn(rxdb.versionManager, 'bulkSync').mockResolvedValue(emptyBulkSyncResult());

    await rxdb.versionManager.push({ batchSize: 0 });

    expect(bulkSync.mock.calls[0]?.[0]?.push?.batchSize).toBe(0);
  });

  it('omits bulkSync push options when batchSize is undefined', async () => {
    const bulkSync = vi.spyOn(rxdb.versionManager, 'bulkSync').mockResolvedValue(emptyBulkSyncResult());

    await rxdb.versionManager.push();

    expect(bulkSync.mock.calls[0]?.[0]).not.toHaveProperty('push');
  });
});
