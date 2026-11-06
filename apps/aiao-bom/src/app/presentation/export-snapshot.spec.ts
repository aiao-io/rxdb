import type { ExplosionManifest } from '@aiao/rxdb-plugin-bom';
import { describe, expect, it } from 'vitest';
import { assertExportSnapshot, ExportSnapshotChangedError } from './export-snapshot';

const manifest = (): ExplosionManifest => ({
  context: { bomType: 'ebom', orgId: 'org-x', asOfDate: new Date('2026-10-17'), unit: 137 },
  parentItemId: 'root',
  parentRevisionId: 'revision-a',
  headerIds: ['h1', 'h2'],
  occurrenceIds: ['o1', 'o2'],
  conversions: [{ from: 'box', to: 'pcs', rate: '12' }],
  formulaGrammarVersion: '1',
  algorithmVersion: '1',
  unresolved: []
});

describe('导出前核对已确认的展开依据', () => {
  it('序列化日期、标识集合顺序及导出附加记录不导致误拒绝', () => {
    const expected = manifest();
    const json = JSON.stringify({
      manifest: { ...expected, headerIds: ['h2', 'h1'], occurrenceIds: ['o2', 'o1'], resolution: { extra: true } }
    });
    expect(() => assertExportSnapshot(json, expected)).not.toThrow();
  });

  it('结构标识不变但换算率变化时仍拒绝下载', () => {
    const expected = manifest();
    const json = JSON.stringify({ manifest: { ...expected, conversions: [{ from: 'box', to: 'pcs', rate: '24' }] } });
    expect(() => assertExportSnapshot(json, expected)).toThrow(ExportSnapshotChangedError);
  });
});
