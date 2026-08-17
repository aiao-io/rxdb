---
id: RV-007
title: local-db 相对 main 的分支评审（含工作区未提交）
status: Open
created: 2026-08-18
updated: 2026-08-18
pr:
---

# Review：`local-db` vs `main`

**判定：⚠️ 值得做，但不能合。**

桌面拆包、握手、会话归属这三件事是真问题，方向对。当前分支仍有两层不能进 `main` 的东西：提交历史是噪声；三端 provider 补齐（`RxDBSource` + `useRxDBOptional`）的改动只躺在工作区未提交、未经 CI 验证——最初评审发现的「Vue 缺位、测试锁旧签名」已在工作区修好（见下方 🔴 #2、#3），但「补齐」本身还没落地成提交。

## 范围

| 项 | 值 |
| --- | --- |
| 分支 | `local-db`（已与 `origin/local-db` 同步） |
| 对比基线 | `main...HEAD` + 工作区未提交（已暂存） |
| 已提交 | 185 文件，+7951 / −1284 |
| 相对 `main` 提交数 | 约 49 |
| 未提交（已暂存） | 三端 provider 补齐：`RxDBSource` + `useRxDBOptional`（Angular / React / Vue 同语义）+ 对应测试 |

主题：把旧 `@aiao/rxdb-adapter-desktop` 拆成 Electron / Tauri，共享协议下沉到 `@aiao/rxdb-adapter-sqlite-core/desktop-host`。顺带补了 handshake 必须在 `open` 之前（US-210 AC#10）、跨窗口会话归属、Windows CLI 空壳 / shebang、Tauri 打包 e2e 与 `.github/workflows/release-desktop.yml`。

故事自己也写了尾巴（见 [requirements/status-overview.md](../status-overview.md)）：E6 的 `npm deprecate` 还没做；Rust host 仍住在 [apps/dev-rxdb-tauri](../../apps/dev-rxdb-tauri)；E11 卡在 `provideRxDB` 只收同步工厂——这正好是工作区那坨未提交改动想补的。

---

## 🟢 好设计

### 握手先于建库

[negotiateProtocolVersion](../../packages/rxdb-adapter-sqlite-core/src/desktop/desktop-sqlite-client.ts) 在任何有副作用的请求之前跑；host 侧 handshake 不碰会话表、不碰路径。版本对不上就不落盘。老 host 回 `protocol_violation: unknown request kind handshake`，**不做降级 open**。这条品味对。

### 孤儿会话有人收

`parseOpenResultOrClose` 在解析失败时尽力 `close`。走到这里 host 已经建了库，调用方拿不到 client——不关就是泄漏到进程退出。

### 会话 FIFO 不传染失败

`DesktopSqliteClient.#tail.then(...)` 吞掉 reject，只把错误交给发起方。一条 SQL 出错不该废掉整条会话。

### session id 不是凭证

Electron SQL / 文件两族都走 [denyForeignSession](../../apps/dev-rxdb-electron/src-electron/desktop-session-ownership.ts)；Tauri [reject_foreign_session](../../apps/dev-rxdb-tauri/src-tauri/src/rxdb/router.rs) 同一条判据：只拒「属于别人」；查不到持有者放行，让 host 答 `session_closed`。把「不存在」报成越权会把重连打死。归属按**应答**记账，被拒的 `open` 不进表。

### 拆包边界对

renderer 入口不碰 `node:sqlite`；`./host` 只留在 electron。[DESKTOP_HOST_ADAPTER_NAMES](../../packages/rxdb-adapter-sqlite-core/src/desktop/desktop-adapter-name.ts) + `satisfies` 让改名在编译期对上。库目录叫 `rxdb-data` 而不是 `databases`——撞 Chromium WebSQL 目录会无声清空用户数据，这条是血教训，不是命名洁癖。

### 信任边界干净

[parseDesktopHostRequest](../../packages/rxdb-adapter-sqlite-core/src/desktop/desktop-host-protocol.ts) 重建对象，多余字段进不来。路径分段拒 `..` / NUL / Windows 保留名。引擎授权器挡 `ATTACH` / `DETACH` / `VACUUM INTO`，不靠扫 SQL。host 永不 reject，错误走 `kind: 'error'`——Tauri `invoke` 的 `Err` 会把 `code` 丢掉。

### Windows CLI shebang

反斜杠、`?` / `#`、`enforce: 'pre'` 剥源码 shebang、只给 `cli.js` 加回去。这是真生产 bug，有测试。

---

## 🔴 合入阻断

### 1. 提交历史不可审

`main..HEAD` 里大量是 `123` / `qwe` / `444` / `` ` `` / `为`。中间夹了几次 merge `main`，以及少数正经信息（desktop feat、Windows CLI、deps）。

这种历史进 `main` 等于永久污染 `git blame` 和 bisect。合之前必须 squash / rebase。现在这 49 个提交**不能**当变更说明。

### 2. 三端 provider：已补齐，但未提交未验证（原 🔴 → 已修复）

**原问题**：工作区只改了 Angular 和 React，Vue 没动、测试还锁旧签名，「三端同一类型」名不副实，单端缺失踩铁律红线。

**现状（已核实，工作区）**：三端已全部对齐——

| | Angular | React | Vue |
| --- | --- | --- | --- |
| 类型名 | `RxDBSource` | `RxDBSource` | `RxDBSource`（`RxDBInput` 为其 Vue 超集） |
| 形态 | 实例 / Promise / 工厂 | 同左 | 同左 + `Ref \| undefined` |
| 可选读取 | `useRxDBOptional` | `useRxDBOptional` | `useRxDBOptional` |
| 失败 vs loading | `failure` 留给 `require()` 抛 | `throw slot.failure` 原样抛 | `failure` 单独入槽，`useRxDB` 原样抛 |

测试也补齐了：Angular [rxdb.provider.spec.ts](../../packages/rxdb-angular/src/__tests__/rxdb.provider.spec.ts) 断言已改为 `(source: RxDBSource) => EnvironmentProviders`；React [public-types.spec.ts](../../packages/rxdb-react/src/__tests__/public-types.spec.ts) 已把 `props.db` 当 `RxDBSource<T>`；三端行为测试都覆盖了 Promise / 工厂、`useRxDBOptional`、所有权与「settle after unmount」。

**剩余风险**：这一切只存在于工作区（已 `git add`），**尚未提交、未跑三端 CI**。「补齐」不等于「落地」。合入前必须提交并让 affected CI 证明三端类型测试 + 行为测试全绿。

### 3. React 异步失败被吞掉（原 🔴 → 已修复）

**原问题**：`useResolvedRxDB` 的 reject 路径只 `console.error`，`useRxDBOptional()` 永远 `undefined`（像还在 loading）、`useRxDB()` 永远抛 `NOT_READY_MESSAGE`（像还在 resolve），失败与未就绪塌成一个状态。

**现状（已核实）**：[rxdb-react.tsx](../../packages/rxdb-react/src/rxdb-react.tsx) 的槽位现在是 `{ db, failure, pending }`，reject 落到 `failure`，`useRxDB()` 遇到 `failure !== undefined` 时 `throw slot.failure` **原样抛出创建异常**；`useRxDBOptional()` 依旧返回 `undefined` 供 loading 态使用。失败与未就绪已经可分。三端统一为「失败原样抛、可选读返回 undefined」这一条契约。

### 4. 旧包还挂在 registry

`@aiao/rxdb-adapter-desktop@0.0.25` 仓库里已经没了，npm 上还在。E6 的 `npm deprecate` 故事自己标了「对外不可逆，需人工确认」。合拆包却不 deprecate，就是让用户装一个指向空气的包。迁移文档 [website/docs/migration/desktop-split.md](../../website/docs/migration/desktop-split.md) 写了不够，发布动作没做就不算收口。

---

## 🟡 该修，但不挡「方向对」

### 协议版本双源

TS `DESKTOP_HOST_PROTOCOL_VERSION` 和 Rust `PROTOCOL_VERSION = 1` 各写一份，只靠 conformance 绑。Handshake 作为增量不加版本——对老 renderer 直接 `open` 成立，但下一回有人改字段形状却忘了抬版本，两边会静默分叉。极限该是单源生成，至少测试里断言两个常量相等。

### Electron `dispatch` 落空走 `execute`

[electron-sqlite-host.ts](../../packages/rxdb-adapter-electron/src/electron-sqlite-host.ts) 在 handshake / open / close / version 之后 `return execute(request)`。今天安全，因为 `handle` 先 `parseDesktopHostRequest`，未知 kind 已经扔了。注释还当地雷写，说明作者自己也不信这条路径。改成穷尽 switch，`never` 兜底。特殊情况不该靠「调用约定」。

### Tauri `transport` 必填，Electron 可读全局

有意的：Electron 靠 preload `contextBridge`，Tauri IPC 必须显式注入。API 面上很容易抄错。README / 选型文档要写死，不要让用户从 electron demo 抄到 tauri 再问为什么。

### Rust host 还在 demo 应用里

US-210 阶段 4（T1 / T2 / T4–T7）没做。`@aiao/rxdb-adapter-tauri` 目前基本是 transport + adapter 壳。对外宣称「Tauri 本地库」会让人以为装这个包就能开库——和当年 desktop 包只导出 transport、host 在 app 里是同一个坑，只是换了包名。

### `selfcheck.rs` 过大

[selfcheck.rs](../../apps/dev-rxdb-tauri/src-tauri/src/selfcheck.rs) +558。诊断二进制塞进 app crate，体积和职责都胀。能接受为 demo 脚手架，别让它冒充可发布 host。

### 注释密度与谎言注释

AGENTS 写「无注释」；这批桌面代码大量是设计文档级 remarks（Chromium 删库、handshake 为何不加版本、所有权规则）。作为安全边界的论证站在这批注释这边。provider 里那句「三端逐字相同」最初是谎言（Vue 对不上），现已随 Vue 补齐而成立——但提醒保留：这类「跨端一致性」断言要么用测试锁死，要么别写成事实。

### `close` 记账靠断言

Electron bridge：`targets.delete((request as { sessionId: string }).sessionId)`。能走到 `response.kind === 'close'` 通常过了 parse，但仍是对未解析 `unknown` 的断言。Tauri 从 request JSON 读，同一味道。从 **response** 或 parse 后的请求上取 id，别信 renderer 原文。

### Angular `provideAppInitializer` 只在根注入器生效

文档写了。路由级 `providers` 上丢异步 source，`inject(RxDB)` 直接扔 `NOT_READY_MESSAGE`。这是 API 陷阱，示例和测试都该覆盖，不能只写在 remarks。

---

## 架构判断（决策五问）

- **数据结构：** 协议重建 + 每窗口会话表 + 每会话 FIFO。对。没有多余状态机。
- **特殊情况：** handshake 无副作用、未知会话 ≠ 越权、孤儿 close、只销毁自己造的实例。特殊情况被收成规则，不是 if/else 丛林。
- **复杂度：** 拆包降低了「renderer 误打进 `node:sqlite`」的复杂度；双份协议常量、Rust 仍在 app、未完成的三端 provider 又加回去了。
- **破坏性：** `desktop` → `sqlite-electron` / `sqlite-tauri` 是正确的破坏，但必须赶在有真实用户之前，且必须 deprecate 旧包。`provideRxDB` 放宽输入相对兼容；`useRxDBOptional` 是新 API，不能只发一端。
- **实用性：** 拆包、握手、归属、Windows CLI——解决的是真问题。未提交的 provider 半成品、垃圾 commit、registry 旧包——是在给用户制造问题。

**ENFP 检查：** 上一个任务（拆包）还没收口（deprecate、Rust 搬家、E11 三端）就开始改框架 provider，而且只改了两端。按现在这个提交习惯，审都审不动。

---

## 合入条件

按这个顺序，少一步都别 merge：

1. **Squash** 成可读的 conventional commits（desktop split / handshake / ownership / windows cli / docs）。`123` 这种不准留。
2. **提交并验证** 工作区的三端 provider 补齐：Vue 已对齐 `RxDBSource` + `useRxDBOptional`，类型测试已改，失败/loading 已可分。剩下的是把这一坨作为独立提交（带测试）落地，并跑三端 affected CI 证明全绿——不要混进拆包提交里。
3. **E6：** `npm deprecate @aiao/rxdb-adapter-desktop`，或在发布清单里写成合并当日的硬步骤，而不是「以后再说」。
4. 文档诚实：Tauri npm 包装的是 transport，可跑 host 还在 `apps/dev-rxdb-tauri`，直到 T1–T7 搬家。
5. 合前跑 affected CI（lint + test，桌面包 + 两个框架包）。别用这 49 个垃圾 commit 的 CI 绿当证据。

---

## 总评

桌面协议 / host 这部分是 🟢 偏 🟡 的工程。流程（垃圾 commit + registry 旧包）仍是 🔴，三端 provider 的断点已在工作区修掉、只差提交与 CI。代码品味在安全边界上是对的；剩下要盯的是让 `qwe` 提交别进 `main`、让补齐的 provider 以干净提交落地。

## 解决记录

- [x] 三端 provider 补齐：Vue 已对齐 `RxDBSource` + `useRxDBOptional`，失败/loading 可分（工作区，未提交）
- [ ] squash / rebase，清掉噪声提交
- [ ] E6：`npm deprecate @aiao/rxdb-adapter-desktop`（对外不可逆，需人工确认）
- [ ] 文档写明 Tauri npm 包尚未包含可发布 Rust host
- [ ] 协议双源、`dispatch` 穷尽、`close` 记账从应答取 id（🟡，可另开）
- [ ] PR 合并，`status: Resolved`
