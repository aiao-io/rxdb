---
name: aiao-rxdb
description: Aiao RxDB（@aiao/rxdb）包选型、槽位组合、插件时序与事务规则，覆盖 v0.0.26 发布范围。
license: MIT
---

# Aiao RxDB 组合指南

事实摘要：`2c8e0193087ea351138479ae9255481359d52ddc05659bcb7137b3eee9e65434`。本文件由事实源、manifest、插件源码与已验证样例生成，只覆盖 v0.0.26 投递范围（不含仅在仓库 main 上、未发布的包）。

## 何时使用

- 回答「装哪几个 `@aiao/*` 包、每个配到哪个槽位、按什么顺序组合」；
- 给出最小可运行的 `use → 注册 adapter → await connect → CRUD → disconnect` 初始化代码；
- 核对插件 `use()` 时序与事务内 `await entity.save()` 的禁止规则。

## 选型规则

- 核心一个：`@aiao/rxdb`，列为消费者直接依赖。
- 每个 backend 槽位各选一个 adapter：local 一个、remote 一个（本地 + 远端组合是常态）。
- 插件可叠加；贡献仓储或带系统贡献的插件必须在 `init()`（首次 `connect()`）之前 `use()`。
- 框架绑定按应用框架选一个；shared-impl 与 capability 不占槽位。

## 投递范围安装清单

| 包 | 角色 | 槽位 | 宿主/备注 | 框架 |
| --- | --- | --- | --- | --- |
| @aiao/code-editor | standalone |  | browser |  |
| @aiao/code-editor-angular | binding |  | browser | angular |
| @aiao/code-editor-react | binding |  | browser | react |
| @aiao/code-editor-vue | binding |  | browser | vue |
| @aiao/rxdb | core |  | browser, node, electron, tauri, miniprogram |  |
| @aiao/rxdb-adapter-electron | backend | local | electron |  |
| @aiao/rxdb-adapter-encrypted | capability |  | browser, node, electron, tauri；依赖 WebCrypto（crypto.subtle）。小程序宿主会随 sqlite-core 加载本包，但没有 crypto.subtle，加密能力不可用。 |  |
| @aiao/rxdb-adapter-http | backend | remote | browser, node |  |
| @aiao/rxdb-adapter-miniprogram | backend | local | miniprogram；实验性；仅已登记平台；单连接，不承诺崩溃恢复；Android 验证状态见兼容性矩阵。 |  |
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
插件（注册工厂，顺序不限）：无
槽位：local=@aiao/rxdb-adapter-wa-sqlite
时序：首次 connect() 之前 use

### react
必需包：@aiao/rxdb、@aiao/rxdb-adapter-wa-sqlite、@aiao/rxdb-react
插件（注册工厂，顺序不限）：无
槽位：local=@aiao/rxdb-adapter-wa-sqlite
时序：首次 connect() 之前 use

### vue
必需包：@aiao/rxdb、@aiao/rxdb-adapter-wa-sqlite、@aiao/rxdb-vue
插件（注册工厂，顺序不限）：无
槽位：local=@aiao/rxdb-adapter-wa-sqlite
时序：首次 connect() 之前 use

### 独立编辑器
必需包：@aiao/code-editor
插件（注册工厂，顺序不限）：无
槽位：无
时序：无

### 图插件
必需包：@aiao/rxdb、@aiao/rxdb-adapter-wa-sqlite、@aiao/rxdb-plugin-graph
插件（注册工厂，顺序不限）：rxDBPluginGraph
槽位：local=@aiao/rxdb-adapter-wa-sqlite
时序：init() 之前 use（即首次 connect() 之前）

### HTTP QueryCache
必需包：@aiao/rxdb、@aiao/rxdb-adapter-http、@aiao/rxdb-adapter-wa-sqlite、@aiao/rxdb-plugin-history、@aiao/rxdb-plugin-querycache、@aiao/rxdb-plugin-sync
插件（注册工厂，顺序不限）：rxDBPluginHistory、rxDBPluginQueryCache、rxDBPluginSync
槽位：local=@aiao/rxdb-adapter-wa-sqlite、remote=@aiao/rxdb-adapter-http
时序：首次 connect() 之前 use

### 纯本地
必需包：@aiao/rxdb、@aiao/rxdb-adapter-pglite
插件（注册工厂，顺序不限）：无
槽位：local=@aiao/rxdb-adapter-pglite
时序：首次 connect() 之前 use

### 双向同步
必需包：@aiao/rxdb、@aiao/rxdb-adapter-supabase、@aiao/rxdb-adapter-wa-sqlite、@aiao/rxdb-plugin-history、@aiao/rxdb-plugin-sync
插件（注册工厂，顺序不限）：rxDBPluginHistory、rxDBPluginSync
槽位：local=@aiao/rxdb-adapter-wa-sqlite、remote=@aiao/rxdb-adapter-supabase
时序：首次 connect() 之前 use

## 时序与事务

- 插件早装：贡献仓储的插件晚于 `init()` `use()` 会按旧注册表初始化；带系统贡献的晚装直接抛错。普通插件晚装合法（立即安装）。
- 事务内禁止 `await entity.save()`：会落回队列并永久挂起。事务内经 `executor.getRepository(...)` 读写，见下方样例。

## Node 离线样例

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
