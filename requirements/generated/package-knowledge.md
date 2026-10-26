# Aiao 包组合知识（v0.0.26）

事实摘要：`5435aef35eae8ebe5e5311957fe7f0791399f47bcfeaa00d7e4ce24e6180a047`。本文件由事实源、manifest、插件源码与已验证样例生成。
安装清单只包含此发布标签树里的包；工作区新增能力见同目录 JSON 的 development 部分。
情景的插件组合与下方样例取自工作区源码（样例在 CI 中执行过），可能新于此发布标签。

## 包选型

每个 local / remote 槽位分别选一个 backend；插件可以组合，框架绑定按应用框架选择。
shared-impl 与 capability 不占后端槽位，tool 与 standalone 不要求 RxDB 后端。

| 包 | 角色 | 槽位 | 宿主 | 框架 |
| --- | --- | --- | --- | --- |
| @aiao/code-editor | standalone |  | browser |  |
| @aiao/code-editor-angular | binding |  | browser | angular |
| @aiao/code-editor-react | binding |  | browser | react |
| @aiao/code-editor-vue | binding |  | browser | vue |
| @aiao/rxdb | core |  | browser, node, electron, tauri, miniprogram |  |
| @aiao/rxdb-adapter-electron | backend | local | electron |  |
| @aiao/rxdb-adapter-encrypted | capability |  | browser, node, electron, tauri |  |
| @aiao/rxdb-adapter-http | backend | remote | browser, node |  |
| @aiao/rxdb-adapter-miniprogram | backend | local | miniprogram |  |
| @aiao/rxdb-adapter-pglite | backend | local | browser, node |  |
| @aiao/rxdb-adapter-sqlite | backend | local | browser |  |
| @aiao/rxdb-adapter-sqlite-core | shared-impl |  | browser, node, electron, tauri, miniprogram |  |
| @aiao/rxdb-adapter-sqlite-wasm | backend | local | browser |  |
| @aiao/rxdb-adapter-sqliteai | backend | local | browser |  |
| @aiao/rxdb-adapter-supabase | backend | remote | browser, node |  |
| @aiao/rxdb-adapter-tauri | backend | local | tauri |  |
| @aiao/rxdb-adapter-wa-sqlite | backend | local | browser |  |
| @aiao/rxdb-angular | binding |  | browser | angular |
| @aiao/rxdb-client-generator | tool |  | node |  |
| @aiao/rxdb-devtools | tool |  | browser |  |
| @aiao/rxdb-plugin-graph | plugin |  | browser, node |  |
| @aiao/rxdb-plugin-history | plugin |  | browser, node |  |
| @aiao/rxdb-plugin-querycache | plugin |  | browser, node |  |
| @aiao/rxdb-plugin-search | plugin |  | browser, node |  |
| @aiao/rxdb-plugin-search-angular | binding |  | browser | angular |
| @aiao/rxdb-plugin-search-react | binding |  | browser | react |
| @aiao/rxdb-plugin-search-vue | binding |  | browser | vue |
| @aiao/rxdb-plugin-storage | plugin |  | browser, node |  |
| @aiao/rxdb-plugin-sync | plugin |  | browser, node |  |
| @aiao/rxdb-plugin-workspace | plugin |  | browser |  |
| @aiao/rxdb-react | binding |  | browser | react |
| @aiao/rxdb-test | tool |  | browser, node |  |
| @aiao/rxdb-vue | binding |  | browser | vue |
| @aiao/utils | standalone |  | browser, node, electron, tauri, miniprogram |  |

## 组合情景

### angular

必需包：@aiao/rxdb、@aiao/rxdb-adapter-wa-sqlite、@aiao/rxdb-angular

插件（顺序不限）：无

槽位：{
  "local": "@aiao/rxdb-adapter-wa-sqlite"
}

时序：use-before-connect

### react

必需包：@aiao/rxdb、@aiao/rxdb-adapter-wa-sqlite、@aiao/rxdb-react

插件（顺序不限）：无

槽位：{
  "local": "@aiao/rxdb-adapter-wa-sqlite"
}

时序：use-before-connect

### vue

必需包：@aiao/rxdb、@aiao/rxdb-adapter-wa-sqlite、@aiao/rxdb-vue

插件（顺序不限）：无

槽位：{
  "local": "@aiao/rxdb-adapter-wa-sqlite"
}

时序：use-before-connect

### 独立编辑器

必需包：@aiao/code-editor

插件（顺序不限）：无

槽位：{}

时序：无

### 图插件

必需包：@aiao/rxdb、@aiao/rxdb-adapter-wa-sqlite、@aiao/rxdb-plugin-graph

插件（顺序不限）：rxDBPluginGraph

槽位：{
  "local": "@aiao/rxdb-adapter-wa-sqlite"
}

时序：use-before-init

### HTTP QueryCache

必需包：@aiao/rxdb、@aiao/rxdb-adapter-http、@aiao/rxdb-adapter-wa-sqlite、@aiao/rxdb-plugin-history、@aiao/rxdb-plugin-querycache、@aiao/rxdb-plugin-sync

插件（顺序不限）：rxDBPluginHistory、rxDBPluginQueryCache、rxDBPluginSync

槽位：{
  "local": "@aiao/rxdb-adapter-wa-sqlite",
  "remote": "@aiao/rxdb-adapter-http"
}

时序：use-before-connect

### 纯本地

必需包：@aiao/rxdb、@aiao/rxdb-adapter-pglite

插件（顺序不限）：无

槽位：{
  "local": "@aiao/rxdb-adapter-pglite"
}

时序：use-before-connect

### 双向同步

必需包：@aiao/rxdb、@aiao/rxdb-adapter-supabase、@aiao/rxdb-adapter-wa-sqlite、@aiao/rxdb-plugin-history、@aiao/rxdb-plugin-sync

插件（顺序不限）：rxDBPluginHistory、rxDBPluginSync

槽位：{
  "local": "@aiao/rxdb-adapter-wa-sqlite",
  "remote": "@aiao/rxdb-adapter-supabase"
}

时序：use-before-connect

## Node 离线样例

在 ESM 项目中运行（`package.json` 设置 `"type": "module"`），使用下面的编译选项。
下方开发依赖包含 TypeScript、Node 与 PGlite 公共声明所需的 Emscripten 类型。执行 `tsc` 后用 `node` 运行输出文件。

```sh
pnpm add @aiao/rxdb@^0.0.26 @aiao/rxdb-adapter-pglite@^0.0.26 @aiao/rxdb-plugin-history@^0.0.26
pnpm add -D typescript@~6.0.3 @types/node@^26.6.5 @types/emscripten@^1.41.6
```

```json
{
  "experimentalDecorators": true,
  "module": "NodeNext",
  "moduleResolution": "NodeNext",
  "skipLibCheck": false,
  "strict": true,
  "target": "ES2022",
  "types": [
    "node",
    "emscripten"
  ]
}
```

```ts
import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import assert from 'node:assert/strict';

@Entity({
  name: 'AiNote',
  namespace: 'ai_example',
  tableName: 'notes',
  log: false,
  properties: [{ name: 'label', type: PropertyType.string, required: true }]
})
export class Note extends EntityBase {
  label!: string;
}

const database = new RxDB({
  dbName: 'aiao-ai-local',
  context: { userId: 'ai-example' },
  entities: [Note],
  sync: { local: { adapter: 'pglite' }, type: SyncType.None }
});

database.use(rxDBPluginHistory);
database.adapter('pglite', async db => new RxDBAdapterPGlite(db, { store: 'memory' }));

try {
  const adapter = await database.connect('pglite');
  assert.ok(adapter instanceof RxDBAdapterPGlite);
  await adapter.transaction(async executor => {
    const repository = executor.getRepository(Note);
    const draft = database.entityManager.instantiate(Note);
    draft.label = 'created';
    const created = await repository.create(draft);
    const query = { where: { combinator: 'and' as const, rules: [] } };
    const rows = await repository.find(query);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.label, 'created');
    await repository.update(created, { label: 'updated' });
    assert.equal((await repository.find(query))[0]?.label, 'updated');
    await repository.remove(created);
    assert.equal((await repository.find(query)).length, 0);
  });
  console.log('✅ 离线样例：初始化、CRUD 与事务执行器全部通过');
} finally {
  await database.disconnectAll();
}
```
