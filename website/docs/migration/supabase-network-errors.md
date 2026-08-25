# Supabase 传输失败错误类型迁移

`@aiao/rxdb-adapter-supabase` 在**连不上远端**时抛出的错误类型变了：过去是本包的 `SupabaseDataError`，现在是 core 的 `NetworkOfflineError`。

这是一次**破坏性变更**，影响所有按 `SupabaseDataError` 捕获网络失败的代码。它换来的是：`QueryCacheRepository` 的 `offlineFallback` 在这个适配器上第一次真的能工作——在此之前，断网时你拿到的不是缓存，是异常。

## 为什么必须改

离线降级由 core 的 [`isNetworkError`](https://github.com/aiao-io/rxdb/blob/main/packages/rxdb/src/repository/network-error.ts) 把门，而它的**默认方向是「不是网络错误」**：认不出的一律判 `false`，原样上抛。

`SupabaseDataError` 五条判据一条不中——不是 `NetworkOfflineError` 实例、没有数字 `status`、`code` 是 `'DATA_ERROR'`、`name` 不在 `NETWORK_ERROR_NAMES` 内、不是 `TypeError`。于是「配置了 QueryCache，断网时读缓存」这条承诺在 supabase 上恒不成立，且**不报错、不告警**，看起来只是查询失败了。

适配器是唯一知道「这次是连不上还是被拒绝」的一层，所以分类责任归它。

## 行为变化

| 场景                                   | 变更前                | 变更后                |
| -------------------------------------- | --------------------- | --------------------- |
| 断网 / DNS 失败 / 连接被拒             | `SupabaseDataError`   | `NetworkOfflineError` |
| 401 / 403（RLS 拒绝）                  | `SupabaseDataError`   | `SupabaseDataError`   |
| 409（唯一约束冲突）                    | `SupabaseDataError`   | `SupabaseDataError`   |
| 502 / 503（远端故障）                  | `SupabaseDataError`   | `SupabaseDataError`   |
| 配置错误（实体未配置、属性类型不支持） | `SupabaseConfigError` | `SupabaseConfigError` |

判据是 **HTTP 状态码，不是错误消息**：postgrest-js 在 fetch 失败时不 reject，而是 catch 掉 `TypeError` 后返回 `{ error, data: null, status: 0 }`。因此 `status === 0` ⇒ 连接没建起来；任何非 0 状态码 ⇒ 连接是通的，401 / 403 / 502 都是远端给出的**回答**，不是离线。

502 和 503 归在「远端的回答」一侧是有意的：请求到达了远端并拿到了状态码，本地缓存未必比远端的错误更接近真相，静默降级会把一次可恢复的服务端故障伪装成正常结果。

受影响的是所有走 `classify_postgrest_error` 的公开方法——`SupabaseRepository` 的 `find` / `count` / `create` / `update` / `remove`、`SupabaseTreeRepository` 的后代与祖先查询、以及适配器的 `fetchMetadata` / `findByIds` / 变更拉取与合并。

## 怎么改

把「按错误类捕获网络失败」改成「按 `isNetworkError` 判定」：

```typescript
// 之前——断网时 NetworkOfflineError 不命中任何分支，变成未处理的 rejection
try {
  await repo.find({ where: { status: 'active' } });
} catch (e) {
  if (e instanceof SupabaseDataError) {
    toast(e.message);
  }
}

// 之后
import { isNetworkError } from '@aiao/rxdb';

try {
  await repo.find({ where: { status: 'active' } });
} catch (e) {
  if (isNetworkError(e)) {
    toast('当前离线，显示的是本地缓存');
  } else if (e instanceof SupabaseDataError) {
    toast(e.message);
  }
}
```

用 `isNetworkError` 而不是 `e instanceof NetworkOfflineError`：前者是 core 对「什么算离线」的唯一权威口径，也覆盖其他适配器与未来新增的判据。

只想把两类都当成失败弹一个提示，不区分离线的话，改成捕获基类即可——`SupabaseSyncError` 覆盖本包所有错误，但**不覆盖** `NetworkOfflineError`（它来自 core），所以这种情况下 `catch` 里不要做类型收窄：

```typescript
catch (e) {
  toast(e instanceof Error ? e.message : String(e));
}
```

## 写路径的重试

写操作（`executeTransaction` / `mergeChanges` / 批量 upsert 与删除）在抛错前会对**瞬时失败**重试最多 3 次，退避 150ms × 尝试次数。「瞬时」按错误消息识别——连接中断、网关超时、上游连接失败、暂时不可用等；RLS 拒绝、约束冲突这类确定性失败第一次就抛出，不重试。

分类发生在**重试耗尽之后**，且只看**最后一次**响应：三次都没连上（`status === 0`）→ `NetworkOfflineError`；最后一次拿到了状态码（哪怕是 504）→ `SupabaseDataError`。所以写路径的错误类型口径与读路径完全一致，只是最坏情况下延迟约 450ms 才抛出。已有的 catch 分支不需要为重试做任何改动。

## `SupabaseNetworkError` 怎么办

本包导出的 `SupabaseNetworkError` 已标记 `@deprecated`，**保留仅为不破坏已发布的公开 API**。它从未在适配器内被抛出过，且不可用于表示离线——`isNetworkError` 同样认不出它。

如果你的代码里 `catch` 了它，那段分支在过去和现在都不会命中，可以直接删掉。

## 参考

- [适配器切换与数据迁移](./adapters.md)
- [v0 → 1.0 升级](./v1.md)
