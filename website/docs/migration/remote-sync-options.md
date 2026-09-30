# `RemoteSyncOptions` 移除

`@aiao/rxdb` 0.0.25 导出的 `RemoteSyncOptions` 类型已删除。**这是破坏性变更**，但只影响类型层：直接 `import type { RemoteSyncOptions }` 的代码会在编译期报错。

这个类型在 0.0.25 里**没有任何 API 接收它**——它是一张孤立的配置草稿，两个字段在运行时都不生效。所以删掉引用不会改变任何行为。

## 两个字段各去了哪

| 0.0.25 字段        | 现状                                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conflictResolver` | 全库 `pull()` 走新增的 `PullOptions.conflictResolver`；单仓库 `pullRepository()` 仍走原有的 `PullRepositoryOptions.conflictResolver`；都不传时用 LWW |
| `autoSync`         | 删除，没有替代——0.0.25 的运行时从未读取过它                                                                                                          |

## 迁移

```diff
-import type { RemoteSyncOptions } from '@aiao/rxdb';
-
-const options: RemoteSyncOptions = { autoSync: false, conflictResolver: myResolver };
+import type { PullOptions } from '@aiao/rxdb';
+
+const options: PullOptions = { conflictResolver: myResolver };

-await rxdb.versionManager.pull();
+await rxdb.syncManager.pull(options);
```

`PullOptions` 仍从 `@aiao/rxdb` 导出；推拉方法本身已从 `rxdb.versionManager`（现由 `@aiao/rxdb-plugin-history` 提供）搬到 `@aiao/rxdb-plugin-sync` 挂的 `rxdb.syncManager`，装包与注册见[历史与同步拆包](./history-sync-plugins.md)。

批量路径（`pull()`）与逐仓库路径（`pullRepository()`）都会透传同一个解决器，对同一份冲突给出同样的结果。运行时能自动应用的解决结果只有 `KEEP_LOCAL` 与 `KEEP_REMOTE`。

## 相关

- [历史与同步拆包](./history-sync-plugins.md)：`versionManager` → `syncManager` 的完整对照
- [版本与 API 稳定性策略](../versioning.md)：破坏性变更流程
