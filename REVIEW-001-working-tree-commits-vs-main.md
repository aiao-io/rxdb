# 分支 `001-working-tree-commits` vs `main` 评审报告

> 评审日期：2026-08-16
> 基线：`main`
> 范围：257 文件，+13188 / −4923（核心可执行代码约 +3279 / −2096，其余为需求/规格文档）

---

## 总体结论：🟢 可合并（含 2 处 🟡 待清理）

这轮改动的核心是**修死锁 + 协议升级 + 脚本重构**。工程质量明显高于基线：大量中文注释精确解释了「为什么」而非「做了什么」，且都带配套 spec 测试。未发现 🔴 级问题。

---

## 1. `packages/rxdb/src/RxDB.ts` — 插件安装错误传播重构 🟢

**改了什么**

- `connect()` 从 `async` 改为手动 Promise 编排（`started` / `failConnect`），解决「插件 `install()` 同步回呼 `connect()`」时 `#connect_promise_map` 未命中导致的死锁。
- 新增 `adapterConnected$()`（每适配器信号）、`#set_adapter_connected()`、`#await_plugin_installs()`。
- 插件安装错误从「仅 `console.error` 吞掉」改为「记入 `#plugin_install_promises`，由 `connect()` 传播」。
- `connected$` 加 `distinctUntilChanged()`。

**评审**

- 🟢 防重入逻辑（先入缓存再 `startConnect`）正确；`init()` 失败路径 `failConnect` 后返回已缓存的 rejected Promise，语义自洽。
- 🟢 `#await_plugin_installs` 里「失败插件保留、后续 connect 复用同一 rejected promise」的理由成立（`install()` 无幂等契约，重跑会盖掉真实原因），解锁点收敛到 `disconnect` / `disconnectAll`，闭环清晰。
- 🟡 **冗余**：`#shutdown()` 中 `#clear_adapter_connected()` 之后又 `#connected_sub.next(false)`。前者内部已 next 过一次；虽然 `distinctUntilChanged` 会去重、`#clear_adapter_connected` 的 early-return 也确实需要兜底，但两行叠在一起容易误判。建议在 `#clear_adapter_connected` 里去掉 early-return 或删掉外层显式 next，只留一处。

## 2. `rxdb-adapter.ts` — 事务签名扩展 🟢

`transaction` / `bootstrapTransaction` 增加 `transactionLog?: boolean`。已确认 `RxDBAdapterPGlite`、`RxDBAdapterSqliteBase` 两个实现类同步 override，且引导期 DDL/元数据查询点都显式传了 `false`。抽象签名变更传播完整，无遗漏实现。

## 3. `rxdb-plugin-search` — FTS 安装死锁修复 🟢

- 原来 `await this.rxdb.connect(localAdapterName)` 会在「connect 等插件 install ↔ 插件等 connect」间死锁。改为等 `adapterConnected$(localAdapterName)`（而非聚合 `connected$`，避免 remote 先连上被提前放行）。
- `merge(..., from(connecting).pipe(ignoreElements()))` 把 connect 失败接进来，避免连接失败时 `firstValueFrom` 永久挂起 —— 处理干净。
- FTS DDL 改走 `bootstrapTransaction(..., false)`，每实体独立事务（冲突只回滚自己）。

## 4. `rxdb-devtools` — 协议 v1→v2 + 私有 MessagePort 信道 🟢

- `DEVTOOLS_PROTOCOL_VERSION` 升到 2，握手时建 `MessageChannel`，握手后 v1 命令走私有端口，杜绝跨源 iframe 旁听。
- 白名单设计克制：握手后 `window` 总线只放行 `PING`，其余丢弃并给一次诊断。
- 端口在 `#postMessage` 前建好并挂 `onmessage`（防同 task 回 ACK 丢帧）、`PING` 触发重握手时重建端口、`DISCONNECT` 在关端口前发送 —— 三处时序都有注释背书，逻辑自洽。
- 🟢 唯一略脆的是 `#startNegotiation` 用 `message === legacyHandshake` 对象身份判断，但注释已解释原因（端点发的就是我们交的那个对象），可接受。

## 5. `scripts/` — 工具脚本重构 🟢

- **`commit-lint.mjs`**：抽成 `validateCommitMessage` / `buildSubjectRegex` / `parseRange` 等纯函数，前缀例外用 `\b` 词边界（修掉了历史 `wipe out the cache` 被误放行的洞），四种模式（husky / 本地 / `--message` / `--range`）语义清晰，配 177 行 spec。
- **`check-workspace.mjs`**：`nx reset` 只在「project graph 真的读不出」时触发，不再无条件 catch 重试 —— 修掉了编译错误也白清缓存的问题。
- **`runner.mjs`**：`reject()` 无参 → `reject(new Error(...))`，第四参 `extra` 支持注入 env。
- **audit 脚本**（`package-runtime-conditions`、`workflow-action-pins`）：重构为可导出纯函数 + spec；`@aiao/source` 构建期条件白名单、40 位 SHA 钉住第三方 action 的门禁理由充分。

## 6. `tsconfig.lib.json` 批量改动 🟢

各包删除 ~40 行重复 `paths`，统一继承 `tsconfig.base.json`（其 paths 已含且更全，如 `adapter-encrypted`、各 `testing` 子路径）。纯 DRY，且顺带修掉了旧副本缺新条目的隐患。

## 7. 依赖与文档 🟢

- `package.json`：`--tui` → `--output-style=static`（Nx 参数演进）、新增 `audit:action-pins`、daisyui / vue-tsc 小版本升级。
- `requirements/` + `specs/`：epic-006 工作树提交状态模型、epic-008 生命周期作用域、US-013 / 014 / 015 等，术语一致、状态归属表清晰，文档本身无矛盾。

---

## 合并前需处理的点

| 级别 | 项 | 建议 |
| --- | --- | --- |
| 🟡 | `#shutdown` 冗余 `next(false)` | 二选一收敛 |
| 🟡 | **提交历史混乱**（大量 `123` / `123123` 草稿提交 + 3 个 `Merge main` 节点） | 走 squash merge，PR 标题/描述需覆盖整个变更（当前 `feat(rxdb): add an option to generate lazy-loadable modules` 远不足以概括本分支实做内容） |

---

## 未做的验证

本次只评审、未执行。建议合并前跑：

```bash
pnpm nx affected -t lint typecheck test
```

确认死锁修复与协议升级没有破坏三框架 demo 的 e2e。
