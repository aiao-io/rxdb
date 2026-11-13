import { computeRxDBSchemaFingerprint } from '@aiao/rxdb';
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { DESKTOP_ENTITIES } from './entities';
import { DESKTOP_SCHEMA_VERSION, SCHEMA_STEPS } from './schema-version';
import { DATA_SEEDS } from './seeds';

/**
 * 升级清单的门禁（ADESK-US-106）：实体结构或数据域变了，就必须同时升 `DESKTOP_SCHEMA_VERSION`、
 * 在 `SCHEMA_STEPS` 登记一行，并更新快照；只改实体不升版本，这里失败。
 *
 * 快照是 `schema-fingerprint.snapshot.json`。升了版本之后更新它：
 *   UPDATE_SCHEMA_SNAPSHOT=1 pnpm exec vitest run --config aiao-desktop/apps/web/vitest.config.mts \
 *     src/app/data/schema-fingerprint.spec.ts --coverage.enabled=false
 */
const SNAPSHOT_URL = new URL('./schema-fingerprint.snapshot.json', import.meta.url);

interface Snapshot {
  readonly version: number;
  readonly entityFingerprint: string;
  readonly domains: readonly { readonly domain: string; readonly version: number }[];
}

const current = (): Snapshot => ({
  version: DESKTOP_SCHEMA_VERSION,
  entityFingerprint: computeRxDBSchemaFingerprint(DESKTOP_ENTITIES),
  domains: DATA_SEEDS.map(seed => ({ domain: seed.domain, version: seed.version })).sort((a, b) =>
    a.domain.localeCompare(b.domain)
  )
});

const stored = (): Snapshot => JSON.parse(readFileSync(SNAPSHOT_URL, 'utf8')) as Snapshot;

describe('schema 版本与实体、数据域同步', () => {
  it('UPDATE_SCHEMA_SNAPSHOT=1 时重写快照', () => {
    if (process.env['UPDATE_SCHEMA_SNAPSHOT'] !== '1') return;
    writeFileSync(SNAPSHOT_URL, `${JSON.stringify(current(), null, 2)}\n`);
  });

  it('快照的版本与当前构建一致：升了 DESKTOP_SCHEMA_VERSION 就要更新快照', () => {
    expect(
      stored().version,
      'DESKTOP_SCHEMA_VERSION 升了但快照没更新：按文件头的命令更新 schema-fingerprint.snapshot.json'
    ).toBe(DESKTOP_SCHEMA_VERSION);
  });

  it('实体结构与数据域没变，或变了就已升版本：改了实体/种子域却没升 DESKTOP_SCHEMA_VERSION 会在这里失败', () => {
    const snapshot = stored();
    const now = current();
    expect(
      now.entityFingerprint,
      '实体结构变了：升 DESKTOP_SCHEMA_VERSION，在 SCHEMA_STEPS 登记一行（字段变了要写 migrate），再更新快照'
    ).toBe(snapshot.entityFingerprint);
    expect(now.domains, '数据域变了（新增、删除或种子版本变了）：升 DESKTOP_SCHEMA_VERSION 并更新快照').toEqual(
      snapshot.domains
    );
  });

  it('升级清单的最后一行就是当前版本', () => {
    expect(SCHEMA_STEPS.at(-1)?.version).toBe(DESKTOP_SCHEMA_VERSION);
  });
});
