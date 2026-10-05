# plugins 静态新发现（2026-10-05）

不分配 RV；仅当前源码候选，等待主控去重/动态确认。RV-060/061 由联审组负责，此处不重复登记。

## search：clear/destroy 遗失已排队 loadMore 的调用方（建议 P2）

- 公开可达入口：SearchHandle.state$ 的 success 订阅回调同步调用 `loadMore()`，随后 `clear()` 或 `destroy()`；典型分页/组件卸载链路，无内部 API。
- 当前真实锚点：`packages/rxdb-plugin-search/src/core/search-handle.ts:149-169` 把调用方 resolver 放入 pendingQuery.waiters；`:240-243` 的 loadMore 等待此 Promise；`:245-248`、`:261-265` 直接把 pendingQuery 清空，没有结算这些 waiters。首屏 resolveResults（`:137`）仍处于 pumpRunning=true，故同步订阅会确实进入待执行队列，而不是构造不可达状态。
- 违反不变量：取消/销毁可以停止执行，但不能遗失已经公开返回的异步操作；该 Promise 永久 pending，调用方 finally/资源释放/加载状态无法收敛。
- 最小复验：新增 `packages/rxdb-plugin-search/src/__tests__/review-parallel-loadmore-settlement.spec.ts`，clear/destroy 两个负向探针＋同一重入点不取消的正向对照。仅使用微任务排空，不以真实时间超时当断言。
- 最小修法：集中实现 pending request 的取消/结算，在 clear/destroy 丢弃前处理 waiters；保留 AbortController/generation 与已运行请求的结算路径，不改分页结果语义。
- 当前动态证据：主控 `parallel/validation/core-plugins-small-adapters-coverage.txt` 与 fresh search JUnit 已确认此新 spec **2 failed /1 passed**；原 search 用例仍过（整包 292 passed /2 failed /0 skip）。两失败分别为 clear/destroy 丢 waiter，正向重入不取消会结算。只标“已动态确认待统一编号”，不标修复；主控尚未通知正式 RV 链接。

## storage：异步 read 完成后在 destroy 之后重新创建 URL（建议 P2，先与历史 RV-043 去重）

- 此项根因与原 RV-043 主题重合，不另编号、不改历史 RV；原问题是否确已修复必须由主控按当前复验判断。当前源码仍存在该路径，不能因为历史记录移除就推断当前通过。
- 公开入口：`rxdb.storage.preview(fileId)` / `createObjectUrl(fileId)` 与连接关闭/`storage.destroy()` 竞争，消费者可以正常触发。
- 真实锚点：`packages/rxdb-plugin-storage/src/storage.service.ts:329-346` 等待 read 后不再核验 lifecycle，直接调用 registry.create；`:648-659` 销毁只等待 activeWrites，不等待只读操作，并先 clear registry；`src/object-url.ts:43-46` 销毁后仍能登记新 URL。
- 不变量：销毁结算后不再新增服务持有的浏览器 URL；否则原服务已终止、URL 和 blob 仍留在 registry，直到消费者主动 dispose/revoke。
- 最小复验：`src/__tests__/review-parallel-preview-lifecycle.spec.ts`。两条异步读取延迟负向＋已完成 URL 回收正向。实际 service/OPFS 实现不 mock，metadata 和 FileSystem handle 是已有内存接缝；gate 仅阻滞 readBlob 返回。允许正确实现等待读取后统一清理，也允许后置生命周期检查拒绝；不强制唯一修法。
- 最小修法：读完成后、URL 创建前重新检查 lifecycle，或者把 URL 生成阶段纳入销毁等待/回收范围；两公开方法对称。
- 缺口：未运行；需要主控独立追加这个最小 spec，不宣称真实浏览器宿主已验证。
