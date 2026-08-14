# @aiao/rxdb-adapter-wa-sqlite

RxDB 适配器，使用 wa-sqlite 在浏览器中运行 SQLite。

## 功能特性

- **本地优先**: 在浏览器中通过 WebAssembly 运行完整 SQLite
- **零服务器**: 无需后端服务器，数据存储在本地
- **SQLite 兼容**: 支持标准 SQLite 语法和功能
- **响应式**: 数据变化自动触发更新
- **高性能**: 使用 Web Worker 避免阻塞主线程

## 何时使用

- 需要轻量级本地数据库（WASM 体积小）
- 需要 SQLite 生态兼容性
- 需要 FTS5 全文搜索
- 对启动速度和内存占用敏感的应用

## 与其他适配器对比

| 特性       | wa-sqlite                | sqlite-wasm | PGlite     |
| ---------- | ------------------------ | ----------- | ---------- |
| 数据库引擎 | SQLite                   | SQLite      | PostgreSQL |
| WASM 大小  | ~500KB                   | ~800KB      | ~3MB       |
| 全文搜索   | FTS5                     | FTS5        | tsvector   |
| VFS 选项   | 多种（IDB/OPFS）         | 标准        | 固定       |
| 成熟度     | 适配器稳定，VFS 分级支持 | 官方支持    | 较新       |

## 安装

```bash
npm install @aiao/rxdb @aiao/rxdb-adapter-wa-sqlite
# 或
pnpm add @aiao/rxdb @aiao/rxdb-adapter-wa-sqlite
```

## 使用

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';

const rxdb = new RxDB({
  dbName: 'app',
  context: { userId: 'current-user' },
  entities: [],
  sync: {
    local: { adapter: 'wa-sqlite' },
    type: SyncType.None
  }
});

rxdb.adapter(
  'wa-sqlite',
  db =>
    new RxDBAdapterWaSqlite(db, {
      vfs: 'IDBBatchAtomicVFS',
      async: true,
      wasmPath: '/wa-sqlite/wa-sqlite-async.wasm'
    })
);

await rxdb.connect('wa-sqlite');
```

## VFS 选项

这些 VFS 来自 wa-sqlite 的 `src/examples/*`，上游未把它们声明为稳定生产 API。本包只把
`IDBBatchAtomicVFS` 作为默认且受支持的生产后端；其它实现必须按下表评估后显式选择。

| VFS                   | 支持等级 | 约束                                                                |
| --------------------- | -------- | ------------------------------------------------------------------- |
| `IDBBatchAtomicVFS`   | 生产支持 | 默认选项；IndexedDB 持久化，覆盖原子写入与多连接回归                |
| `MemoryVFS`           | 仅测试   | 同步、非持久化                                                      |
| `MemoryAsyncVFS`      | 仅测试   | asyncify、非持久化                                                  |
| `IDBMirrorVFS`        | 实验性   | IndexedDB 镜像实现，升级前需重新跑持久化回归                        |
| `AccessHandlePoolVFS` | 实验性   | 仅 dedicated Worker；依赖 OPFS sync access handle                   |
| `OPFSAdaptiveVFS`     | 实验性   | 仅 dedicated Worker                                                 |
| `OPFSAnyContextVFS`   | 实验性   | 支持 Window、dedicated Worker、SharedWorker；只建议只读或近只读负载 |
| `OPFSCoopSyncVFS`     | 实验性   | 仅 dedicated Worker；不要求 SharedArrayBuffer                       |
| `OPFSWriteAheadVFS`   | 实验性   | 仅 dedicated Worker；升级前需重新验证恢复与并发行为                 |

`worker` 必须与 `workerInstance` 成对提供，`sharedWorker` 必须与 `sharedWorkerInstance` 成对提供，
两种 transport 互斥。Worker/SharedWorker 由调用方创建并持有；适配器不会替调用方 `terminate()`。

```typescript
const worker = new Worker(new URL('./wa-sqlite.worker.js', import.meta.url), { type: 'module' });

new RxDBAdapterWaSqlite(db, {
  vfs: 'OPFSCoopSyncVFS',
  async: false,
  worker: true,
  workerInstance: worker,
  wasmPath: '/wa-sqlite/wa-sqlite.wasm'
});
```

公开的 `WA_SQLITE_VFS_LIST` 是深冻结的能力表，不能用作自定义 VFS 注册入口。

## wa-sqlite 供应链

npm registry 没有本包所需的 wa-sqlite，因此依赖固定到上游不可变 commit
`2bf1c59d89eb6497535a4217bc62fec68a0bb994`（上游 `v1.1.2` release；其 `package.json`
的 `version` 字段仍写作 `1.1.1`，上游未随 tag 升位），`pnpm-lock.yaml` 同时固定归档 SHA-512。
`pnpm audit:wa-sqlite` 会校验所有直接消费者、commit URL 与 lockfile integrity；升级 commit 时必须
重新审计 `src/examples/*` 的 9 个 VFS 内部路径和能力矩阵。

## 完整示例

参考 [dev-rxdb-angular](https://github.com/aiao-io/rxdb/tree/main/apps/dev-rxdb-angular) 中的集成示例。
