---
name: aiao-rxdb
description: Aiao RxDB（@aiao/rxdb）包选型、槽位组合、插件时序与事务规则，覆盖 v0.0.28 发布范围。
license: MIT
---

# Aiao RxDB 组合指南

事实摘要：`fa4db8e423c9c309135f24f32a8530c08ff9f0b0bf29682dcabe770e9be3e1a6`。由事实源、manifest、插件源码与已验证样例生成，仅列 v0.0.28 已发布包。

## 何时使用

用于选包、槽位和插件组合，以及初始化、CRUD 和事务代码。

## 选型规则

- 核心 `@aiao/rxdb` 必须是消费者直接依赖。
- local、remote 各选一个 backend adapter，可组合本地与远端。
- 框架绑定按应用选一个；shared-impl、capability 不占槽位。

## 投递范围安装清单

清单与情景包名省略 `@aiao/`，安装时补全；其他 scope 原样保留。

|包|角色|槽位|宿主/备注|框架|
|---|---|---|---|---|
|code-editor|standalone||browser||
|code-editor-angular|binding||browser|angular|
|code-editor-react|binding||browser|react|
|code-editor-vue|binding||browser|vue|
|rxdb|core||browser,node,electron,tauri,miniprogram||
|rxdb-adapter-electron|backend|local|electron||
|rxdb-adapter-encrypted|capability||browser,node,electron,tauri；依赖 WebCrypto（crypto.subtle）。小程序宿主会随 sqlite-core 加载本包，但没有 crypto.subtle，加密能力不可用。||
|rxdb-adapter-http|backend|remote|browser,node||
|rxdb-adapter-miniprogram|backend|local|miniprogram；实验性；仅已登记平台；单连接，不承诺崩溃恢复；Android 验证状态见兼容性矩阵。||
|rxdb-adapter-pglite|backend|local|browser,node||
|rxdb-adapter-sqlite|backend|local|browser||
|rxdb-adapter-sqlite-core|shared-impl||browser,node,electron,tauri,miniprogram||
|rxdb-adapter-sqlite-wasm|backend|local|browser||
|rxdb-adapter-sqliteai|backend|local|browser||
|rxdb-adapter-supabase|backend|remote|browser,node||
|rxdb-adapter-tauri|backend|local|tauri||
|rxdb-adapter-wa-sqlite|backend|local|browser||
|rxdb-angular|binding||browser|angular|
|rxdb-client-generator|tool||node||
|rxdb-devtools|tool||browser||
|rxdb-model|model||browser,node||
|rxdb-model-angular|binding||browser|angular|
|rxdb-model-react|binding||browser|react|
|rxdb-model-vue|binding||browser|vue|
|rxdb-plugin-graph|plugin||browser,node||
|rxdb-plugin-history|plugin||browser,node||
|rxdb-plugin-querycache|plugin||browser,node||
|rxdb-plugin-replay|plugin||browser,node||
|rxdb-plugin-replay-angular|binding||browser|angular|
|rxdb-plugin-replay-react|binding||browser|react|
|rxdb-plugin-replay-vue|binding||browser|vue|
|rxdb-plugin-search|plugin||browser,node||
|rxdb-plugin-search-angular|binding||browser|angular|
|rxdb-plugin-search-react|binding||browser|react|
|rxdb-plugin-search-vue|binding||browser|vue|
|rxdb-plugin-storage|plugin||browser,node||
|rxdb-plugin-sync|plugin||browser,node||
|rxdb-plugin-tree|plugin||browser,node||
|rxdb-plugin-tree-angular|binding||browser|angular|
|rxdb-plugin-tree-react|binding||browser|react|
|rxdb-plugin-tree-vue|binding||browser|vue|
|rxdb-plugin-working-tree|plugin||browser,node||
|rxdb-plugin-working-tree-angular|binding||browser|angular|
|rxdb-plugin-working-tree-react|binding||browser|react|
|rxdb-plugin-working-tree-vue|binding||browser|vue|
|rxdb-plugin-workspace|plugin||browser||
|rxdb-react|binding||browser|react|
|rxdb-taro|tool||node,miniprogram||
|rxdb-test|tool||browser,node||
|rxdb-vue|binding||browser|vue|
|utils|standalone||browser,node,electron,tauri,miniprogram||

## 组合情景

### angular
必需包：rxdb、rxdb-adapter-wa-sqlite、rxdb-angular
插件（注册工厂，顺序不限）：无
槽位：local=rxdb-adapter-wa-sqlite
时序：首次 connect() 之前 use

### react
必需包：rxdb、rxdb-adapter-wa-sqlite、rxdb-react
插件（注册工厂，顺序不限）：无
槽位：local=rxdb-adapter-wa-sqlite
时序：首次 connect() 之前 use

### vue
必需包：rxdb、rxdb-adapter-wa-sqlite、rxdb-vue
插件（注册工厂，顺序不限）：无
槽位：local=rxdb-adapter-wa-sqlite
时序：首次 connect() 之前 use

### 独立编辑器
必需包：code-editor
插件（注册工厂，顺序不限）：无
槽位：无
时序：无

### 图插件
必需包：rxdb、rxdb-adapter-wa-sqlite、rxdb-plugin-graph
插件（注册工厂，顺序不限）：rxDBPluginGraph
槽位：local=rxdb-adapter-wa-sqlite
时序：init() 之前 use

### HTTP QueryCache
必需包：rxdb、rxdb-adapter-http、rxdb-adapter-wa-sqlite、rxdb-plugin-history、rxdb-plugin-querycache、rxdb-plugin-sync
插件（注册工厂，顺序不限）：rxDBPluginHistory、rxDBPluginQueryCache、rxDBPluginSync
槽位：local=rxdb-adapter-wa-sqlite、remote=rxdb-adapter-http
时序：首次 connect() 之前 use

### 纯本地
必需包：rxdb、rxdb-adapter-pglite
插件（注册工厂，顺序不限）：无
槽位：local=rxdb-adapter-pglite
时序：首次 connect() 之前 use

### 双向同步
必需包：rxdb、rxdb-adapter-supabase、rxdb-adapter-wa-sqlite、rxdb-plugin-history、rxdb-plugin-sync
插件（注册工厂，顺序不限）：rxDBPluginHistory、rxDBPluginSync
槽位：local=rxdb-adapter-wa-sqlite、remote=rxdb-adapter-supabase
时序：首次 connect() 之前 use

### 树插件
必需包：rxdb、rxdb-adapter-wa-sqlite、rxdb-plugin-tree
插件（注册工厂，顺序不限）：rxDBPluginTree
槽位：local=rxdb-adapter-wa-sqlite
时序：init() 之前 use

## 时序与事务

- 插件可叠加。贡献仓储或系统贡献的插件必须在 `init()`（首次 `connect()`）前 `use()`；晚装时前者按旧注册表初始化，后者抛错。普通插件可晚装，立即安装。
- 事务内禁止 `await entity.save()`：会落回队列并永久挂起。事务内经 `executor.getRepository(...)` 读写，见下方样例。

## Node 离线样例

```sh
pnpm add @aiao/rxdb@^0.0.28 @aiao/rxdb-adapter-pglite@^0.0.28 @aiao/rxdb-plugin-history@^0.0.28
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
