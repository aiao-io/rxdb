import { deterministicStringify } from '@aiao/rxdb';
import type { BomExportPayload, ExplosionManifest } from '@aiao/rxdb-plugin-bom';

/** 真实导出快照已与页面确认过的解析依据分离。 */
export class ExportSnapshotChangedError extends Error {
  constructor() {
    super('结构数据已变化，请重新展开并核对后再导出。');
    this.name = 'ExportSnapshotChangedError';
  }
}

const identity = (manifest: Record<string, unknown>): string => {
  const normalized = JSON.parse(JSON.stringify(manifest)) as Record<string, unknown>;
  normalized['headerIds'] = [...(normalized['headerIds'] as string[])].sort();
  normalized['occurrenceIds'] = [...(normalized['occurrenceIds'] as string[])].sort();
  return deterministicStringify(normalized);
};

/** 对照完整展开依据，允许导出合同额外携带自己的resolution记录。 */
export const assertExportSnapshot = (json: string, expected: ExplosionManifest): void => {
  const actual = (JSON.parse(json) as BomExportPayload).manifest;
  const selected = Object.fromEntries(Object.keys(expected).map(key => [key, actual[key]]));
  if (identity(selected) !== identity({ ...expected })) throw new ExportSnapshotChangedError();
};
