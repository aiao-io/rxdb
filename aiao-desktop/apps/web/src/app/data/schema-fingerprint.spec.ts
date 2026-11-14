import { computeRxDBSchemaFingerprint } from '@aiao/rxdb';
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { FREEFORM_ENTITIES } from '../apps/freeform/freeform.entities';
import { DesktopFile } from '../disk/desktop-file.entity';
import { DESKTOP_ENTITIES } from './entities';
import { DESKTOP_SCHEMA_VERSION, SCHEMA_STEPS } from './schema-version';
import { DATA_DOMAINS, domainOf } from './seeds';
import { SystemPreference } from './system-preference.entity';

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

/** 各数据域的种子版本：种子数据模块是动态导入的，逐域装载出来再取版本。 */
const current = async (): Promise<Snapshot> => {
  const seeds = await Promise.all(DATA_DOMAINS.map(domain => domain.load()));
  return {
    version: DESKTOP_SCHEMA_VERSION,
    entityFingerprint: computeRxDBSchemaFingerprint(DESKTOP_ENTITIES),
    domains: seeds
      .map(seed => ({ domain: seed.domain, version: seed.version }))
      .sort((a, b) => a.domain.localeCompare(b.domain))
  };
};

const stored = (): Snapshot => JSON.parse(readFileSync(SNAPSHOT_URL, 'utf8')) as Snapshot;

describe('schema 版本与实体、数据域同步', () => {
  it('UPDATE_SCHEMA_SNAPSHOT=1 时重写快照', async () => {
    if (process.env['UPDATE_SCHEMA_SNAPSHOT'] !== '1') return;
    writeFileSync(SNAPSHOT_URL, `${JSON.stringify(await current(), null, 2)}\n`);
  });

  it('快照的版本与当前构建一致：升了 DESKTOP_SCHEMA_VERSION 就要更新快照', () => {
    expect(
      stored().version,
      'DESKTOP_SCHEMA_VERSION 升了但快照没更新：按文件头的命令更新 schema-fingerprint.snapshot.json'
    ).toBe(DESKTOP_SCHEMA_VERSION);
  });

  it('实体结构与数据域没变，或变了就已升版本：改了实体/种子域却没升 DESKTOP_SCHEMA_VERSION 会在这里失败', async () => {
    const snapshot = stored();
    const now = await current();
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

describe('数据域登记（DATA_DOMAINS）与实体登记（DESKTOP_ENTITIES）一致', () => {
  /** 不属于任何数据域的实体：系统偏好、磁盘文件行、Freeform 笔迹，它们没有初始数据。 */
  const UNSEEDED = [SystemPreference, DesktopFile, ...FREEFORM_ENTITIES];

  it('数据域的名字互不重复', () => {
    const names = DATA_DOMAINS.map(domain => domain.domain);
    expect(new Set(names).size).toBe(names.length);
  });

  it('每个数据域装载出来的种子，域名与登记的一致，版本是正整数', async () => {
    for (const domain of DATA_DOMAINS) {
      const seed = await domain.load();
      expect(seed.domain, `数据域 ${domain.domain} 装载出的种子域名不一致`).toBe(domain.domain);
      expect(Number.isInteger(seed.version) && seed.version > 0).toBe(true);
      expect(typeof seed.run).toBe('function');
    }
  });

  it('每个数据域的实体都登记在桌面库里（DESKTOP_ENTITIES），而且每个域至少有一个实体', () => {
    for (const domain of DATA_DOMAINS) {
      expect(domain.entities.length, `数据域 ${domain.domain} 没有实体`).toBeGreaterThan(0);
      for (const entity of domain.entities) expect(DESKTOP_ENTITIES).toContain(entity);
    }
  });

  it('各数据域的实体互不重叠：一个实体只属于一个数据域', () => {
    const all = DATA_DOMAINS.flatMap(domain => domain.entities);
    expect(new Set(all).size).toBe(all.length);
  });

  it('桌面库里除系统偏好、磁盘文件行与 Freeform 笔迹外，每个实体都归属某个数据域', () => {
    for (const entity of DESKTOP_ENTITIES) {
      if (UNSEEDED.includes(entity)) expect(domainOf(entity)).toBeUndefined();
      else expect(domainOf(entity), `${entity.name} 没有归属任何数据域`).toBeDefined();
    }
  });
});
