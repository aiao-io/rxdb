import { getEntityMetadata, type EntityType, type RxDB } from '@aiao/rxdb';
import { LifecycleScope } from '@aiao/utils';
import { describe, expect, it } from 'vitest';
import { P2PFileManifestEntity } from './p2p-file-manifest.entity';
import { RxDBPluginP2PFiles, rxDBPluginP2PFiles } from './plugin';

const createDatabase = (): RxDB =>
  ({
    config: { entities: [], sync: {} }
  }) as unknown as RxDB;

describe('P2P 文件插件', () => {
  it('安装时注册同步清单实体，并在作用域销毁时撤销', async () => {
    const db = createDatabase();
    const plugin = new RxDBPluginP2PFiles(db);
    const scope = new LifecycleScope('p2p-files-test');
    plugin.install(scope);
    expect(plugin.name).toBe('p2pFiles');
    expect(db.config.entities).toContain(P2PFileManifestEntity as unknown as EntityType);
    await scope.dispose();
    expect(db.config.entities).not.toContain(P2PFileManifestEntity as unknown as EntityType);
  });

  it('不重复注册宿主预先配置的实体，并提供插件工厂', async () => {
    const db = createDatabase();
    db.config.entities.push(P2PFileManifestEntity as unknown as EntityType);
    const scope = new LifecycleScope('p2p-files-test');
    new RxDBPluginP2PFiles(db).install(scope);
    expect(db.config.entities.filter(entity => entity === P2PFileManifestEntity)).toHaveLength(1);
    expect(rxDBPluginP2PFiles(db)).toBeInstanceOf(RxDBPluginP2PFiles);
    await scope.dispose();
  });

  it('实体元数据保留清单索引', () => {
    const metadata = getEntityMetadata(P2PFileManifestEntity);
    expect(metadata.name).toBe('P2PFileManifest');
    expect(metadata.indexes.map(index => index.name)).toEqual(
      expect.arrayContaining(['content_hash', 'content_holder', 'updated_at'])
    );
  });
});
