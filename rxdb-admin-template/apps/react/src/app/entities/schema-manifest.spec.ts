import { describeEntityFields, getEntityMetadata, type EntityMetadataResolver } from '@aiao/rxdb';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENTITIES } from './asset-entities';

/**
 * 读取产品的数据模式清单（`rxdb-admin-template/schema/collaboration-schema.json`）：协作服务初始化时把它登记为工作区的
 * 第一个数据模式版本，按它校验上传、候选与合并。三端各有这条用例，保证清单就是本端实体定义生成的结果。
 * 路径相对当前用例文件（happy-dom 环境下 `import.meta.url` 不是文件地址）。
 */
function readManifest(): { schemaVersion: unknown; entities: unknown[] } {
  const testPath = expect.getState().testPath;
  if (!testPath) throw new Error('当前用例的文件路径不可用');
  return JSON.parse(
    readFileSync(resolve(dirname(testPath), '../../../../../schema/collaboration-schema.json'), 'utf8')
  ) as { schemaVersion: unknown; entities: unknown[] };
}

describe('数据模式清单与实体定义一致', () => {
  it('清单的实体描述就是本端实体定义经 describeEntityFields() 的输出，顺序与注册顺序相同', () => {
    const manifest = readManifest();
    const metadata = ENTITIES.map(entity => getEntityMetadata(entity));
    const resolveEntity: EntityMetadataResolver = (entity, namespace) =>
      metadata.find(item => item.name === entity && item.namespace === namespace);
    const generated = {
      schemaVersion: manifest.schemaVersion,
      entities: metadata.map(item => describeEntityFields(item, resolveEntity))
    };
    expect(JSON.parse(JSON.stringify(generated))).toEqual(manifest);
  });

  it('清单带从 1 开始的整数版本号', () => {
    const { schemaVersion } = readManifest();
    expect(Number.isSafeInteger(schemaVersion) && Number(schemaVersion) >= 1).toBe(true);
  });
});
