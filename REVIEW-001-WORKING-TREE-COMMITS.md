# `001-working-tree-commits` 相对 `main` 代码评审报告

## 结论

**评级：🔴 不建议合并**

当前分支存在确定的就绪门绕过、插件失败后无法恢复、DevTools 通信边界不完整和 benchmark 超时误判。审查期间出现的未提交修复还导致测试、类型检查和格式门禁失败，因此当前状态不具备合并条件。

## 评审范围

- 当前分支：`001-working-tree-commits`
- 比较基线：`main`
- merge-base：`c74d231b1ac841e9c8e2e556e4a611a132f66f3d`
- 非 merge 提交：57 个
- 已提交差异：168 个文件，`+9315/-2808`
- 主要变更：CI、`RxDB.connect()` 插件安装时序、search FTS 初始化、SQLite `rawQuery`、DevTools 通信协议、benchmark 清理、E2E 静态服务器、Vue E2E、tsconfig 与需求文档

审查过程中工作区又出现一批未提交改动，主要覆盖 search 连接状态和 DevTools MessagePort 通道。本报告的发现项以审查结束时的工作树快照为准；测试结果明确区分已提交态和未提交 WIP。

## 发现项

### P0：当前未提交工作树无法通过 CI

涉及文件：

- `packages/rxdb-devtools/src/__tests__/connector.boundaries.spec.ts`
- `packages/rxdb-devtools/src/__tests__/types.spec.ts`
- `apps/rxdb-devtools-extension/src/devtools/services/port.service.spec.ts`
- `packages/rxdb-plugin-search/src/__tests__/*`

执行受影响任务时发现：

1. `connector.boundaries.spec.ts` 仍导入已删除的 `session-command.js`，导致 `rxdb-devtools:typecheck` 和两个测试套件无法加载。
2. DevTools 与扩展的协议测试仍断言已经删除的 `sessionToken`。
3. search 插件改用 `adapterConnected$()`，但测试 fake RxDB 未补该方法，造成 19 个测试失败。
4. `pnpm check-format` 报告 `connector.spec.ts`、`RxDB.ts`、`rxdb-adapter.ts` 未格式化。

影响：当前 WIP 是确定性的 CI blocker，不能直接提交。

建议：同步更新所有测试夹具、fake RxDB、协议断言和 MessagePort 测试，再重新执行 affected CI。

### P1：公共 `rawQuery()` 绕过 RxDB 就绪门

位置：`packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts:563`

```ts
if (this.#lifecycle_state === 'bootstrap') {
  return this.bootstrapTransaction(executor => executor.query(sql, params), false);
}
```

`rawQuery` 是 `IRxDBAdapter` 的公开入口，不是 search 插件私有 API。当 `adapter.connect()` 已完成、但 RxDB 建表或迁移尚未完成时，外部代码可以直接执行 SQL，重新暴露以下问题：

- `no such table`
- 查询到半初始化 schema
- 与同文件 `query()`、`transaction()` 的就绪语义不一致

search 插件已经显式调用 `bootstrapTransaction()`，没有必要扩大所有 `rawQuery()` 调用者的权限。

建议：恢复 `rawQuery()` 的普通 `transaction()` 路径，只允许明确的内部引导代码调用 `bootstrapTransaction()`。

缺失测试：外部 `rawQuery()` 在 `adapter.connect()` 完成但实体表尚未建立时必须继续等待。

### P1：插件安装失败会永久毒化 RxDB 实例

位置：

- `packages/rxdb/src/RxDB.ts:512`
- `packages/rxdb/src/RxDB.ts:794`

未提交改动选择保留 rejected install Promise，后续 `connect()` 会持续拿到同一个错误。但是连接失败时，该适配器已经从 connected set 移除；随后执行 `disconnect(adapterName)` 时：

```ts
const wasConnected = this.#set_adapter_connected(adapterName, false);
if (wasConnected && this.#connected_adapters.size === 0) {
  await this.#shutdown();
}
```

此时 `wasConnected === false`，所以 `#shutdown()` 不会执行，`#plugin_install_promises` 也不会清空。最终表现为：

1. 插件发生一次瞬时安装错误。
2. `connect()` 失败。
3. 调用方执行 `disconnect(adapterName)` 并修复外部条件。
4. 后续每次 `connect()` 仍永久返回第一次错误。

这直接破坏现有“插件安装失败后可重试”契约，也与代码注释声称的“`disconnect()` 是解锁点”矛盾。

建议：要么在错误被传播后删除失败记录，要么保证失败连接的单适配器 `disconnect()` 也完整执行插件 teardown 和安装状态复位。必须补瞬时失败、单适配器断开、重连成功的集成测试。

### P2：MessagePort 只保护了半条通信链路

位置：

- `apps/rxdb-devtools-extension/src/content/bridge.ts:36`
- `apps/rxdb-devtools-extension/src/content/bridge-core.ts:27`

新实现让 DevTools 命令通过 MessagePort 下发，但端口建立以后，content bridge 仍然接受并转发所有合法的 `page-to-devtools` window 消息。

因此，后注入的同源脚本即使拿不到私有端口，仍能通过 `window.postMessage` 伪造：

- `DB_INFO`
- `ENTITY_DATA`
- `EVENT`
- 其他页面到 DevTools 的响应

这会污染面板展示的数据和状态。实现注释声称握手后双向通信全部走私有端口，但上行路径没有执行这个约束。

建议：端口建立后，window 总线只允许重新握手所需消息；其他页面上行消息必须来自当前 MessagePort。补“握手后 window 伪造响应被拒绝”的测试。

### P2：IndexedDB 删除被错误限制为 50ms

位置：`benchmarks/src/clear-db.ts:43`

```ts
const timer = setTimeout(failBlocked, DELETE_BLOCKED_TIMEOUT_MS);
```

定时器从调用 `indexedDB.deleteDatabase()` 时立即开始，而不是在收到 `onblocked` 后开始。合法但超过 50ms 的数据库删除也会被判定失败。与此同时，真正的 `onblocked` 在当前实现中立即 reject，所以这个 50ms 定时器主要惩罚正常慢操作。

现有测试只覆盖立即成功、立即失败和立即 blocked，没有覆盖慢成功。

建议：只在收到 `onblocked` 后启动合理的秒级超时，或者设置明确的总操作超时，并补“超过 50ms 后成功”的测试。

### P2：最后一个适配器断开时 `connected$` 重复发射 `false`

位置：

- `packages/rxdb/src/RxDB.ts:558`
- `packages/rxdb/src/RxDB.ts:667`

`#set_adapter_connected()` 在删除最后一个适配器时已经执行：

```ts
this.#connected_sub.next(false);
```

随后 `disconnect()` 调用 `#shutdown()`，`#shutdown()` 结尾再次执行 `this.#connected_sub.next(false)`。`connected$` 本身没有 `distinctUntilChanged()`，订阅者会收到两次断开通知，可能重复执行 teardown、清理或 UI 状态转换。

建议：连接状态只通过一个状态变更入口发送，删除 `#shutdown()` 中的重复发射，或者在公开流上统一去重。

### P2：CI 供应链加固没有完成

位置：`.github/workflows/ci-template.yml:33`、`:910`、`:919`

工作流明确声明第三方 action 必须钉完整 commit SHA，但两处 Codecov 仍使用可变 tag：

```yaml
uses: codecov/codecov-action@v7
```

该 action 同时获得 Codecov secret 和 OIDC 能力。可变 tag 被强推或上游账号失陷时，恶意 action 可以直接运行在 CI runner 中。

此外，`id-token: write` 当前配置在 reusable workflow 顶层，所有 job 都继承，而实际只有 coverage 上传需要它。

建议：

1. 将两处 Codecov action 钉到完整 commit SHA。
2. 把 `id-token: write` 下沉到 coverage job。
3. 增加自动审计，拒绝第三方 `uses:` 使用 tag。

### P3：任何构建失败都会触发 `nx reset` 后完整重跑

位置：`scripts/check-workspace.mjs:76`

代码注释声称只处理 project graph 损坏，但 `catch` 捕获所有构建错误。真实的 TypeScript、打包或 API 错误同样会执行 `nx reset` 并完整重跑一次。

影响：

- postinstall 失败时间翻倍
- 首个错误被第二轮日志冲淡
- `nx reset` 被误用成通用 fallback

建议：单独验证 project graph，或只对明确的 daemon/project graph 错误执行一次 reset；真实 build failure 应原样立即传播。

### P3：commit 前缀例外仍可绕过格式门禁

位置：`scripts/commit-lint.mjs:87`

```js
const prefixed = ALLOWED_PREFIXES.some(prefix => firstLine.toLowerCase().startsWith(prefix.toLowerCase()));
```

`startsWith` 会放行 `wiping data`、`ReleaseWhatever`、`Revertible` 等不合规文本。虽然比原来的任意位置子串匹配更严格，但仍没有真正建立 token 边界。

建议使用类似规则：

```regex
^(?:Revert|Release|wip)(?:\s|:|$)
```

并为词内前缀补反例测试。

## 已确认被未提交 WIP 覆盖的问题

以下问题存在于当前分支 HEAD，但审查期间出现的未提交改动正在尝试修复：

1. search 插件原本使用全局 `connected$` 判断本地 SQLite 是否就绪。远程适配器先连接时会提前放行 FTS DDL。WIP 新增了 `adapterConnected$(localAdapterName)`，方向正确，但测试夹具尚未同步。
2. DevTools 原本把 `sessionToken` 通过同一个可观察的 `window.postMessage` 通道公开发送，无法认证扩展身份，并且导航后保留旧 token 会破坏 v1 兼容。WIP 改成 MessagePort，但仍存在本报告所述的上行绕过。

这些问题不能因为有未提交代码就视为关闭；必须等实现、测试和协议文档同时落地并通过 CI。

## 验证结果

### 已提交态

在未提交 WIP 出现之前，以下任务通过：

| 项目                       | 结果                                        |
| -------------------------- | ------------------------------------------- |
| scripts                    | 125 passed                                  |
| `rxdb`                     | 119 files / 2062 tests passed               |
| `rxdb-adapter-sqlite-core` | 39 files / 836 tests passed                 |
| `rxdb-plugin-search`       | 226 tests passed                            |
| `rxdb-devtools`            | 300 tests passed，statement coverage 96.48% |
| `rxdb-devtools-extension`  | 208 tests passed                            |
| `benchmarks`               | 51 tests passed                             |
| 相关 typecheck             | passed                                      |
| `pnpm check-format`        | passed                                      |

Nx 最后报告 Nx Cloud 免费额度/网络错误，但使用 `--skipRemoteCache` 后不影响本地任务结果。

### 当前未提交 WIP 快照

执行命令：

```bash
pnpm nx run-many -t typecheck test \
  -p rxdb rxdb-plugin-search rxdb-devtools rxdb-devtools-extension \
  --output-style=static --parallel=2 --skipRemoteCache
```

结果：

| 项目                                | 结果                                                  |
| ----------------------------------- | ----------------------------------------------------- |
| `rxdb-devtools:test`                | 3 个测试文件失败，185 passed                          |
| `rxdb-devtools:typecheck`           | 失败，导入已删除 fixture                              |
| `rxdb-devtools-extension:test`      | 2 failed / 206 passed                                 |
| `rxdb-plugin-search:test`           | 19 failed / 207 passed，另有 1 个 unhandled rejection |
| `rxdb:typecheck`                    | passed                                                |
| `rxdb-plugin-search:typecheck`      | passed                                                |
| `rxdb-devtools-extension:typecheck` | passed                                                |
| `pnpm check-format`                 | failed                                                |

`rxdb:test` 在沙箱内因监听本地端口被系统以 `EPERM` 拒绝，未进入测试执行。随后申请沙箱外定向复测时，审批服务返回 404，因此没有把该环境错误算作代码失败。

## 缺失的关键测试

1. remote adapter 先完成、本地 SQLite 仍在建表时，search FTS 不得提前安装。
2. 外部 `rawQuery()` 在 bootstrap 窗口必须等待完整 `RxDB.connect()`。
3. 插件瞬时失败后，单适配器 disconnect/reconnect 能恢复。
4. MessagePort 握手后，window 总线伪造的上下行消息都被拒绝。
5. DevTools 页面从 v2 导航到 v1，以及 v1 导航到 v2 的兼容行为。
6. IndexedDB 删除超过 50ms 后正常成功。
7. 最后一个适配器断开时，`connected$` 只发一次 `false`。

## 合并前最低要求

1. 修复两个 P1 行为问题：`rawQuery()` 就绪门和插件失败恢复。
2. 完成 MessagePort 双向边界，不能只保护命令下行。
3. 更新全部测试夹具和协议断言，消除当前 P0 门禁失败。
4. 修复 benchmark 删除超时误判。
5. 钉死 Codecov action SHA，并缩小 OIDC 权限。
6. 重新执行 affected lint、typecheck、test、build、E2E 和 coverage gate。

在以上条件满足前，当前分支不应进入合并队列。

## 修复记录（本报告全部发现项已处理）

| 发现项                           | 处理                                                                                                                                                                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 门禁失败                      | 夹具、协议断言、fake RxDB 全部同步；`pnpm check-format` 与 `tag:js-lib` 的 lint/test/build 恢复绿色                                                                                                                                      |
| P1 `rawQuery()` 绕过就绪门       | 外部入口统一等待完整 `RxDB.connect()`，补回归测试                                                                                                                                                                                        |
| P1 插件安装失败毒化实例          | 失败不再永久置位，单适配器 disconnect/reconnect 可恢复，补回归测试                                                                                                                                                                       |
| P2 MessagePort 只保护半条链路    | 按选型改为 MessageChannel 私有端口，上下行同时校验；window 总线伪造消息被拒                                                                                                                                                              |
| P2 IndexedDB 删除 50ms 误判      | 移除硬编码超时，超过 50ms 的正常删除不再判失败                                                                                                                                                                                           |
| P2 `connected$` 重复发射 `false` | 收敛到单一状态变更入口，最后一个适配器断开只发一次                                                                                                                                                                                       |
| P2 CI 供应链加固                 | 两处 Codecov 钉到 `fb8b3582c8e4def4969c97caa2f19720cb33a72f # v7.0.0`；`id-token: write` 下沉到 coverage job；新增 `pnpm audit:action-pins` 门禁（`scripts/audit/workflow-action-pins.mjs`），扫 `.github` 下全部 workflow 与复合 action |
| P3 任何构建失败都 `nx reset`     | `buildNeedLibs` 先用 `nx show projects --json` 探图：图正常直接抛出原始构建错误，只有图读不出来才 reset 重试                                                                                                                             |
| P3 commit 前缀 `startsWith` 绕过 | 改为 `\b` 词边界正则，补 `wipe` / `Released` / `Reverting` 反例测试                                                                                                                                                                      |
| 缺失测试 1–7                     | 逐条补齐；另新增 React / Angular 两端 `opfs.spec.ts`，与 Vue 端选择器对齐                                                                                                                                                                |

两点需要留档：

1. Angular demo 的 `remote-cache.spec.ts` 里「命中缓存不发网络请求」此前是**假绿**——生产构建注册了 `ngsw-worker.js`，SW 发出的请求不经过 `page.route`，计数恒为 0。已加 `test.use({ serviceWorkers: 'block' })`。react / vue 未注册 SW，不受影响。
2. Vue 端第三条 OPFS 用例（rename 失败时对话框保持打开）未移植到 react：react 用瞬时 toast 而非常驻 `opfs-error` 元素报错，断言还依赖 `renameOpfsEntry` 真的失败，照搬会得到一条不稳定的用例。
