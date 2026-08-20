# @aiao/rxdb-plugin-graph

> Implements: [US-503 图数据插件](https://github.com/aiao-io/rxdb/blob/main/requirements/stories/plugin/US-503-graph-data.md)

RxDB 图数据插件，提供有向/无向图、可选边权重与属性、邻居查询和路径查询。

## 安装

```bash
pnpm add @aiao/rxdb @aiao/rxdb-adapter-wa-sqlite @aiao/rxdb-plugin-graph
```

## 使用

```typescript
import { PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { GraphEntity, GraphEntityBase, rxDBPluginGraph } from '@aiao/rxdb-plugin-graph';
// SQLite 实现从子路径导入 —— 根入口不再强制拉入它，
// 只用 PGlite / Supabase 时不会为此付出打包体积（GRAPH-010）
import { SqliteGraphRepository } from '@aiao/rxdb-plugin-graph/sqlite';

@GraphEntity({
  name: 'Person',
  properties: [{ name: 'name', type: PropertyType.string }],
  features: { graph: { type: 'directed-graph', weight: true } }
})
class Person extends GraphEntityBase {
  name!: string;
}

const rxdb = new RxDB({
  dbName: 'social',
  entities: [Person],
  sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' } }
});

rxdb.use(rxDBPluginGraph).adapter(
  'wa-sqlite',
  db =>
    new RxDBAdapterWaSqlite(db, {
      vfs: 'MemoryAsyncVFS',
      async: true,
      wasmPath: '/wa-sqlite/wa-sqlite-async.wasm',
      repositories: { GraphRepository: SqliteGraphRepository }
    })
);

await rxdb.connect('wa-sqlite');
rxdb.init();

const alice = new Person({ name: 'Alice' });
const bob = new Person({ name: 'Bob' });
await rxdb.entityManager.saveMany([alice, bob]);
await Person.addEdge(alice, bob, 1);

Person.findNeighbors$({ entityId: alice.id, direction: 'out', level: 1 }).subscribe(neighbors => {
  console.log(neighbors[0]?.node.name);
});
```

`level=0` 不返回邻居。`findNeighbors()`、`countNeighbors()` 和 `findPaths()` 保留 Promise API；对应的
`findNeighbors$()`、`countNeighbors$()` 和 `findPaths$()` 返回会随节点或边变更刷新的 Observable。
邻居查询不包含起始节点，路径查询返回非循环路径及对应边信息。邻居与路径结果默认最多返回
1000 条，调用方可通过 `limit` 调低或提高，上限为 10000；结果超过 `limit` 或路径搜索触及内部资源上限时，数组的 `truncated` 为 `true`。

## 连接纪元

插件声明 `lifecycle: 'scoped'`，唯一的宿主改动——注册 `GraphRepository`——登记在 `install(scope)`
收到的作用域上，`disconnectAll()` 时随作用域一起撤销，宿主不会调用 `destroy()`。重新 `connect()`
会重新注册。改造前这条注册没人管，断连后仓库仍挂在 `rxdb` 上、指向的却是一个已经拆掉的纪元。
