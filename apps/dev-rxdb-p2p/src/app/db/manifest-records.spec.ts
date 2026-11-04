import { manifestId } from '@aiao/rxdb-plugin-p2p';
import { describe, expect, it } from 'vitest';
import { groupSharedFiles, recordOf, type ManifestRow } from './manifest-records';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const holder = (name: string): string => `holder_${name.repeat(64).slice(0, 64)}`;

const row = (contentHash: string, holderId: string, at: number, overrides: Partial<ManifestRow> = {}): ManifestRow => ({
  id: manifestId(contentHash, holderId),
  contentHash,
  fileName: `${contentHash.slice(0, 1)}.bin`,
  size: 3,
  chunkSize: 2,
  chunkHashes: ['c'.repeat(64), 'd'.repeat(64)],
  sourceUrl: null,
  holderId,
  updatedAt: new Date(at),
  ...overrides
});

describe('recordOf', () => {
  it('turns a synced row into a wire record with an epoch updatedAt', () => {
    const source = row(HASH_A, holder('1'), 1000, { sourceUrl: `/api/files/${HASH_A}` });

    expect(recordOf(source)).toEqual({
      id: source.id,
      contentHash: HASH_A,
      fileName: 'a.bin',
      size: 3,
      chunkSize: 2,
      chunkHashes: ['c'.repeat(64), 'd'.repeat(64)],
      sourceUrl: `/api/files/${HASH_A}`,
      holderId: holder('1'),
      updatedAt: 1000
    });
  });

  it('drops a null sourceUrl instead of carrying it into the record', () => {
    expect(recordOf(row(HASH_A, holder('1'), 1000))).not.toHaveProperty('sourceUrl');
  });

  it('rejects rows that break the content-addressing rules', () => {
    expect(recordOf(row(HASH_A, holder('1'), 1000, { chunkHashes: ['c'.repeat(64)] }))).toBeNull();
    expect(recordOf(row(HASH_A, holder('1'), 1000, { id: manifestId(HASH_B, holder('1')) }))).toBeNull();
  });
});

describe('groupSharedFiles', () => {
  it('lists each content once with its holders, newest first', () => {
    const records = [
      row(HASH_A, holder('1'), 1000),
      row(HASH_B, holder('1'), 3000),
      row(HASH_A, holder('2'), 2000, { sourceUrl: `/api/files/${HASH_A}` })
    ].map(source => recordOf(source)!);

    const files = groupSharedFiles(records);

    expect(files.map(file => file.contentHash)).toEqual([HASH_B, HASH_A]);
    expect(files[1]!.holders.map(record => record.holderId)).toEqual([holder('2'), holder('1')]);
    expect(files[1]!.manifest.holderId).toBe(holder('2'));
    expect(files[1]!.serverCopy).toBe(true);
    expect(files[0]!.serverCopy).toBe(false);
  });
});
