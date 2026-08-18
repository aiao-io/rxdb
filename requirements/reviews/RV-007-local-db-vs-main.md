---
id: RV-007
title: local-db 相对 main 的分支评审
status: Open
created: 2026-08-18
updated: 2026-08-18
pr:
---

# Review：`local-db` vs `main`

**判定：⚠️ 方向对，代码质量高于基线，但不能直接合。**

桌面拆包、握手前置、会话归属这三件事都是真问题，解法也对。安全边界上的品味尤其好。挡在合入前的是两类东西：**提交历史不可审**（50 个提交里 40 个是 `123` / `qwe` / `444`），以及 **E6 的 `npm deprecate` 没做**。代码层面另有 2 处建议合并前修、7 处建议修。

## 范围

| 项                 | 值                                                           |
| ------------------ | ------------------------------------------------------------ |
| 分支               | `local-db`（已与 `origin/local-db` 同步）                    |
| 对比基线           | `main...HEAD`                                                |
| 变更量             | 185 文件，+7951 / −1284                                      |
| 相对 `main` 提交数 | 50                                                           |
| 工作区             | 干净（上一版评审记录的「三端 provider 未提交」已落地成提交） |
| 验证方式           | 纯静态评审，**未执行** `pnpm test-all` / typecheck           |

两条主线：

1. **桌面拆包** —— 旧 `@aiao/rxdb-adapter-desktop` 拆成 Electron / Tauri 两个包，共享线协议下沉到 `@aiao/rxdb-adapter-sqlite-core/desktop-host` 次入口。顺带补了 handshake 必须在 `open` 之前（US-210 AC#10）、跨窗口会话归属、SQLite 授权器、Windows CLI shebang、Tauri 打包 e2e 与 [release-desktop.yml](../../.github/workflows/release-desktop.yml)。
2. **三端 provider 补齐** —— `RxDBSource` + `useRxDBOptional`（Angular / React / Vue 同名同语义），1053 行，US-207 E11 的前提。

故事自己还有尾巴（见 [status-overview.md](../status-overview.md)）：E6 的 `npm deprecate` 未做；Rust host 仍住在 [apps/dev-rxdb-tauri](../../apps/dev-rxdb-tauri)。

---

## 🔴 合入阻断

### 1. 提交历史不可审

`main..HEAD` 共 50 个提交，其中 **40 个**标题是 `123` / `123123` / `qwe` / `444` / `333` / `11` / `为` / `` ` ``。正经信息只有零星几条（desktop feat、Windows CLI、`chore(deps)`）。

这种历史进 `main` 等于永久污染 `git blame` 与 bisect。合之前必须 squash / rebase 成可读的 conventional commits。**这 50 个提交不能当变更说明，它们跑绿的 CI 也不能当验证证据。**

### 2. 旧包还挂在 registry

`@aiao/rxdb-adapter-desktop@0.0.25` 仓库里已经没了，npm 上还在。E6 的 `npm deprecate` 故事自己标了「对外不可逆，需人工确认」。合了拆包却不 deprecate，就是让用户装一个指向空气的包。迁移文档 [website/docs/migration/desktop-split.md](../../website/docs/migration/desktop-split.md) 写得够清楚，但**发布动作没做就不算收口**。

---

## 🟠 代码缺陷

### 1. `commitWrite` 在 `sync()` 失败时泄漏 fd

[electron-file-host.ts:553-565](../../packages/rxdb-adapter-electron/src/electron-file-host.ts#L553-L565)

第 555 行已 `session.writes.delete(writeId)`，随后 `pending.handle.sync()`（557）抛出时，catch 只删临时文件、**从不 close 句柄**。此时该写入已不在 `session.writes` 里，`closeSession` 的 `discardWrite` 扫描和 `file.writeAbort` 都够不着它 —— fd 泄漏到宿主进程退出为止。

讽刺的是 `beginWrite` 的注释（498 行）正好写着「不设上限，一个只 begin 不 commit 的 renderer 就能把宿主的 fd 耗光」—— 这条路径把那道上限绕过去了。

Rust 侧没有这个问题：[file/mod.rs:261](../../apps/dev-rxdb-tauri/src-tauri/src/rxdb/file/mod.rs#L261) 的 `finish_write` 把 `File` `take()` 到局部变量，`sync_all` 失败时靠 Drop 关闭。语义是对的，只是 TS 的 `FileHandle` 没有 Drop。

**修法**：catch 里补 `await pending.handle.close().catch(() => undefined)`。必须带 `.catch` —— `rename` 失败时句柄已关，二次 close 会 reject，与 409 行 `discardWrite` 同样处理。

### 2. `#onMessage` 会把异常抛出 Electron 传输回调

[desktop-sqlite-client.ts:263](../../packages/rxdb-adapter-sqlite-core/src/desktop/desktop-sqlite-client.ts#L263)

`transport.subscribe(message => client.#onMessage(message))` 未包 try/catch，而 `#onMessage`（447）里的 `parseDesktopHostChangeEvent` 对不合协议的负载会抛。Electron 传输层是同步扇出，**一个 client 抛出会让排在它后面的 client 收不到这条变更**，表现为「某个库的响应式查询不刷新」—— 所有故障形态里最难查的一种。

Tauri 侧 [tauri-host-transport.ts:132-138](../../packages/rxdb-adapter-tauri/src/tauri-host-transport.ts#L132-L138) 的 `deliver` 已经逐个 listener 包了 try/catch，注释也把理由写清楚了。两条传输层应对称。

### 3. React：sync 工厂返回共享实例时，StrictMode 会断掉它

[rxdb-react.tsx:120-154](../../packages/rxdb-react/src/rxdb-react.tsx#L120-L154)

`isDeferred` 对**任何函数**返回 `true`，于是 `db={() => moduleSingleton}` 被判为「本 Provider 造的」，卸载时负责 `disconnectAll()`。StrictMode 双挂载下：

1. effect 跑，`Promise.resolve(source())` 挂进微任务队列
2. cleanup **同步**跑（`flushPassiveEffects` 内一个栈跑完 create→destroy→create），此时 `owned` 还是 `undefined`，不断开
3. 微任务 resolve，`disposed === true` → `shutdown(database)` —— **断掉的是调用方的模块级单例**
4. 第二次挂载的 promise resolve，把这个已断开的实例设为 state

结果：挂载着的 Provider 持有一个断开的库。而 113-116 行的注释恰好论证了「不碰调用方实例」正是为了避开这一幕 —— 所有权判据落在 `source` 的**形态**上（是不是函数），而不是它**是否真的新造了实例**，这个假设代码验证不了。

Angular / Vue 同样把「函数」判为 owned，但两端都没有双挂载，只有 React 会踩。

**修法**：至少在 `RxDBSource` 的文档上写死「工厂必须每次返回新实例；要复用单例请直接传实例」；更稳的是 React 端在 resolve 后对同一实例做身份比对再决定是否接管。

### 4. 数组绑定用元素个数对比字节预算

[desktop-host-protocol.ts:421](../../packages/rxdb-adapter-sqlite-core/src/desktop/desktop-host-protocol.ts#L421)

```ts
if (value instanceof Uint8Array) return value.byteLength <= DESKTOP_HOST_MAX_BLOB_BYTES; // 420 正确
if (Array.isArray(value)) return value.length <= DESKTOP_HOST_MAX_BLOB_BYTES && isNumberArray(value);
```

第 421 行把 64 MiB 当成了元素**个数**上限。JSON 通道上一个 6700 万元素的 number 数组能过校验。

### 5. `BigInt()` 解析不 canonical

[desktop-json-codec.ts:160](../../packages/rxdb-adapter-tauri/src/desktop-json-codec.ts#L160)

`BigInt(payload)` 接受 `"0x10"`、带空白的字符串、`""`→`0n`。旁边的 base64 解码器是刻意严格的 canonical 校验，同一个 codec 里两种松紧度不一致。建议先用 `/^-?\d+$/` 卡一道。

### 6. `beginWrite` 存在 TOCTOU

[electron-file-host.ts:495-520](../../packages/rxdb-adapter-electron/src/electron-file-host.ts#L495-L520)

上限检查（496）到 `session.writes.set`（510）之间隔着 `containedPath` / `mkdir` / `open` 三个 await。并发的 `file.writeBegin` 会集体通过检查，256 的上限可被并发窗口突破 —— 也就是这条上限本来要防的 DoS。

Rust 侧是对的：[file/mod.rs:550](../../apps/dev-rxdb-tauri/src-tauri/src/rxdb/file/mod.rs#L550) 的 `register_write` 在同一把锁内 check + insert，上限精确。

### 7. 消费审计吞掉 tsc 诊断

[desktop-adapter-consumer.mjs:104-113](../../scripts/audit/desktop-adapter-consumer.mjs#L104-L113)

`run()` 只在 resolve 路径转发输出。`execFile` 的 reject 消息只追加 **stderr**，而 `tsc` 把诊断写 **stdout**。这个脚本是 [release-desktop.yml](../../.github/workflows/release-desktop.yml) 的门禁：类型检查挂掉时 CI 日志只有一行 `Command failed: ... tsc --project tsconfig.json`，没有任何可操作信息。

**修法**：try/catch 后转发 `error.stdout` / `error.stderr` 再重抛。

---

## 🟡 该修，但不挡「方向对」

### 协议版本双源（已部分收口）

TS `DESKTOP_HOST_PROTOCOL_VERSION` 与 Rust `PROTOCOL_VERSION: i64 = 1` 仍各写一份。但 [protocol-handshake.spec.ts](../../apps/dev-rxdb-tauri/conformance/protocol-handshake.spec.ts) 现在不止比对活进程的握手版本，还用正则读 **Rust 源文件**的常量并与 TS 断言相等 —— 陈旧二进制掩盖不了漂移。这是全 diff 里唯一把两端常量钉在一起的东西，做对了。极限仍该是单源生成，但漂移风险已从「静默」降到「变红」。

### Electron `dispatch` 落空走 `execute`

[electron-sqlite-host.ts:256](../../packages/rxdb-adapter-electron/src/electron-sqlite-host.ts#L256) 在 handshake / open / close / version 之后 `return execute(request)`。今天安全，因为 `handle` 先跑 `parseDesktopHostRequest`，未知 kind 已经被扔掉。注释还当地雷写，说明作者自己也不信这条路径。改成穷尽 switch + `never` 兜底，别靠「调用约定」。

### `close` 记账对未解析请求做断言

[desktop-sqlite-bridge.ts:141](../../apps/dev-rxdb-electron/src-electron/desktop-sqlite-bridge.ts#L141)：`targets.delete((request as { sessionId: string }).sessionId)`。能走到 `response.kind === 'close'` 通常已过 parse，但仍是对未解析 `unknown` 的断言。Tauri 从 request JSON 读，同一味道。**从应答或 parse 后的请求上取 id，别信 renderer 原文。**

### 忙等 deadline 起算点

[electron-sqlite-host.ts:239](../../packages/rxdb-adapter-electron/src/electron-sqlite-host.ts#L239) `deadline ??= performance.now() + budget` 从**首次失败**起算而非请求起算，实际忙等窗口略大于配置值。

### `rxdb-plugin-storage` 的死 external

[vite.config.mts:66](../../packages/rxdb-plugin-storage/vite.config.mts#L66) 的 build `external` 仍列 `@aiao/rxdb-adapter-electron`，但该包现在只是 devDependency，`src/desktop.ts` 已改为从 `sqlite-core/desktop-host` 引入。死条目（第 128 行的 vitest `server.deps.external` 仍需要，别一起删）。

### `pending` 字段的文档与行为不符

[rxdb-react.tsx:73-74](../../packages/rxdb-react/src/rxdb-react.tsx#L73-L74) 写「source 是异步的**且尚未解析完成**」，实际取值是 `isDeferred(source)` —— 解析完成后依旧是 `true`。行为无误（该字段只在 `db === undefined` 时被读），但文档是错的。这类断言要么改名（`deferred`），要么改文案。

### 无关变更混入

`package.json` 的 `@types/pg`、`verdaccio` 升级，以及 `onlyBuiltDependencies` 新增 6 项（`@swc/core` / `esbuild` / `@parcel/watcher` / `lmdb` / `unrs-resolver` / `msgpackr-extract`）与本分支主题无关。最后一项**放宽了允许执行安装脚本的包集合**，属供应链面变更，应单独成 commit 便于追溯。

### Rust host 还在 demo 应用里

US-210 阶段 4（T1 / T2 / T4–T7）没做，`@aiao/rxdb-adapter-tauri` 目前是 transport + adapter 壳。对外宣称「Tauri 本地库」会让人以为装这个包就能开库 —— 和当年 desktop 包只导出 transport、host 在 app 里是同一个坑，只是换了包名。文档必须写明。

### `rxdb-adapter-tauri` 单测偏薄

只有 2 个 spec（codec / transport），缺 `RxDBAdapterTauri.spec.ts`，构造函数里的 `assertValidDesktopDatabaseName` 无直接单测（由 conformance 与 consumer audit 间接覆盖）。Electron 侧有 14 个 spec。

### Angular `provideAppInitializer` 只在根注入器生效

[rxdb.provider.ts:103-105](../../packages/rxdb-angular/src/rxdb.provider.ts#L103-L105) 的 remarks 写了，但这是 API 陷阱：路由级 `providers` 上丢异步 source，`inject(RxDB)` 直接抛 `NOT_READY_MESSAGE`。示例和测试都该覆盖，不能只写在注释里。

---

## 🟢 好设计

### 握手先于建库

`negotiateProtocolVersion` 在任何有副作用的请求之前跑；host 侧 handshake 分派放在**首位**，不碰会话表、不碰 `resolve_database_path`（[session.rs](../../apps/dev-rxdb-tauri/src-tauri/src/rxdb/session.rs)）。版本对不上就不落盘，配套测试刻意不预建数据目录并断言 `!directory.exists()`。老 host 回 `protocol_violation: unknown request kind handshake`，**不做降级 open**。

### session id 不是凭证

Electron SQL / 文件两族都走 [denyForeignSession](../../apps/dev-rxdb-electron/src-electron/desktop-session-ownership.ts)，Tauri `reject_foreign_session` 同一条判据：只拒「属于别人」；查不到持有者放行，让 host 答 `session_closed`。把「不存在」报成越权会把重连打死。归属按**应答**记账，被拒的 `open` 不进表。这修掉的是真实越权 —— 此前 session id 只用于回收、从不用于鉴权。

### 授权器而非扫 SQL

引擎授权器挡 `ATTACH` / `DETACH`（顺带堵掉 `VACUUM INTO`），两侧齐平，四条测试覆盖到「外部库文件未被创建 / 未被修改」。不靠正则扫 SQL 这条品味对。

### `is_autocommit()` 替代错误文本匹配

`engine.rs` 把「靠 SQLite 错误消息字符串判断有无活动事务」换成稳定 API。实打实的健壮性修复。

### 信任边界干净

`parseDesktopHostRequest` 重建对象，多余字段进不来；路径分段拒 `..` / NUL / Windows 保留名；host 永不 reject，错误走 `kind: 'error'` —— 因为 Tauri `invoke` 与 Electron `ipcRenderer.invoke` 都会把 `Err` 拍平成字符串，丢掉自定义 `code`。

### 拆包边界对

renderer 入口不碰 `node:sqlite`；`./host` 只留在 electron。**三份消费方 vite 配置都列了 `'@aiao/rxdb-adapter-sqlite-core/desktop-host'` 子路径 external** —— 漏一个就会重复打包协议模块并让 `instanceof` 失效，这里没漏。库目录叫 `rxdb-data` 而不是 `databases`：撞 Chromium WebSQL 目录会无声清空用户数据，这是血教训不是命名洁癖。

### 自检模式的边界感

`app.exit()` 而非 `std::process::exit()`，让 `RunEvent::Exit` 跑到 `DesktopHost::close_all()`；报告里的 `app_data_dir` 取自**活的** `DesktopHost` 而非重读环境变量，「读了变量但没接上」的 bug 无法静默通过；配置错误在建窗**之前** `exit(3)`，绝不对着用户真实数据目录开窗；e2e 硬超时 90s > Rust 看门狗 60s，保证 renderer 挂死时拿到的是 `timedOut` 报告而不是「进程没退出」。

### 三端对称被测试锁住

三个包各有一份同名同结构的 [tri-framework-provider.spec.ts](../../packages/rxdb-vue/src/__tests__/tri-framework-provider.spec.ts)，断言全部在**编译期**成立（`@ts-expect-error` 由 `tsc --noEmit` 校验，指令下那行不再报错就以 TS2578 失败）。任一端单方面收紧或放宽，对应端同名用例即失败。Vue 的 `Ref` 超集被明确划到对称契约之外，由 `public-types.spec.ts` 单独覆盖。**「跨端一致性」断言用测试锁死，而不是写成注释里的事实** —— 这正是上一版评审要求的收口方式。

### 无 fallback 兜底守住了

pglite 拒绝而非静默替换、adapter 不匹配硬失败不降级 OPFS、自检配置错误直接退出、版本不匹配直接报错。[local-backend.ts:101-107](../../apps/dev-rxdb-tauri/src/app/local-backend.ts#L101-L107) 还专门写清了「连接**前**按运行时能力选后端」与「连接**失败后**改道」的边界 —— 前者允许，后者是静默数据分叉。这个区分很关键。

---

## 上一版评审已解决项

| 原问题                                          | 现状                                                                                                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 🔴 三端 provider 只改 Angular / React，Vue 缺位 | **已解决**：三端 `RxDBSource` + `useRxDBOptional` 齐平，且已提交（工作区干净），另有三份对称契约测试       |
| 🔴 React 异步失败被吞成 loading                 | **已解决**：槽位改为 `{ db, failure, pending }`，`useRxDB()` 遇 `failure` 时 `throw slot.failure` 原样抛出 |
| 🟡 协议双源无测试保护                           | **已部分解决**：conformance 用正则读 Rust 源文件常量并与 TS 断言相等                                       |
| 🟡 provider 注释里「三端逐字相同」是谎言        | **已解决**：Vue 补齐后断言成立，且由 `tri-framework-provider.spec.ts` 锁住                                 |

---

## 架构判断（决策五问）

- **数据结构**：协议重建 + 每窗口会话表 + 每会话 FIFO。对，没有多余状态机。
- **特殊情况**：handshake 无副作用、未知会话 ≠ 越权、孤儿 close、只销毁自己造的实例。特殊情况被收成规则，不是 if/else 丛林。
- **复杂度**：拆包降低了「renderer 误打进 `node:sqlite`」的复杂度；双份协议常量、Rust 仍在 app 又加了一点回去。
- **破坏性**：`desktop` → `sqlite-electron` / `sqlite-tauri` 是正确的破坏，但必须赶在有真实用户之前，且必须 deprecate 旧包。
- **实用性**：拆包、握手、归属、Windows CLI 解决的是真问题；垃圾 commit、registry 旧包是在给用户制造问题。

---

## 合入条件

按这个顺序，少一步都别 merge：

1. **Squash** 成可读的 conventional commits（desktop split / handshake / ownership / tri-framework provider / windows cli / docs / deps）。40 个 `123` 不准留。
2. 修 🟠 #1（fd 泄漏）与 🟠 #2（事件回调抛出）—— 两条都在宿主进程里，且都有现成的对称实现可抄。
3. **E6**：`npm deprecate @aiao/rxdb-adapter-desktop`，或写进发布清单成为合并当日的硬步骤。**对外不可逆，需人工确认。**
4. 文档写明：Tauri npm 包装的是 transport，可跑 host 还在 `apps/dev-rxdb-tauri`，直到 T1–T7 搬家。
5. 单独跑一次 typecheck —— `nx build` 不拦 TS 错误，build 绿不等于类型对。
6. 跑 affected CI（lint + test，桌面包 + 三个框架包）。别拿这 50 个提交的 CI 绿当证据。

---

## 总评

桌面协议 / host 这部分是 🟢 偏 🟡 的工程，安全边界上的判断力明显高于基线：授权器而非扫 SQL、错误当返回值而非 reject、握手无副作用、所有权规则三端逐字相同并被测试锁死。三端 provider 从上一版的断点状态收口完毕。

剩下的问题集中在两处：**流程**（垃圾提交 + registry 旧包）仍是 🔴，**宿主进程的资源回收**（fd 泄漏、事件回调抛出、TOCTOU）有 3 处 TS 侧缺陷 —— 有意思的是它们在 Rust 侧全是对的，靠的是 Drop 语义和锁内 check-and-insert。TS 端缺的正是这两样，值得在下一轮把两侧的资源生命周期写成同一套显式模式。

## 解决记录

- [x] 三端 provider 补齐并落地成提交：Vue 对齐 `RxDBSource` + `useRxDBOptional`，失败 / loading 可分
- [x] 三端对称由 `tri-framework-provider.spec.ts` 编译期锁住
- [x] 协议双源由 conformance 断言 Rust 源文件常量
- [ ] squash / rebase，清掉 40 个噪声提交
- [x] 🟠 #1 `commitWrite` fd 泄漏 —— 失败路径补 `handle.close()`，新增 `electron-file-host-faults.spec.ts` 注入 `sync()` 故障
- [x] 🟠 #2 `#onMessage` 抛出 Electron 传输回调 —— 改走 `reportOutOfBand`（`queueMicrotask` 重抛），逐 handler 包 try/catch，与 Tauri `deliver` 对称
- [x] 🟠 #3 React sync 工厂 + StrictMode 断掉共享实例 —— 引入 `RxDBLease`，断开由「还有没有挂载持有」决定；顺带消掉工厂被调用两次
- [x] 🟠 #5 `BigInt` canonical —— TS 侧 `CANONICAL_BIGINT`、Rust 侧 `is_canonical_bigint`，两端拒同一组写法
- [x] 🟠 #6 `beginWrite` TOCTOU —— 额度检查与占位落进同一段同步代码（`reservations`）
- [x] 🟠 #7 审计吞 tsc 诊断 —— `run()` 失败路径转发 `error.stdout` / `error.stderr` 后再抛
- [x] 🟠 #4 数组字节预算 —— **误报**，见下
- [x] 破坏性 / 行为变化清单（versioning-policy §5），见下
- [ ] E6：`npm deprecate @aiao/rxdb-adapter-desktop`（对外不可逆，需人工确认）
- [x] 文档写明 Tauri npm 包尚未包含可发布 Rust host —— **本就已写**，见下
- [x] 🟡 项复核并采纳（`dispatch` 穷尽、`close` 记账去断言、死 external、`pending` 文档），见下
- [ ] PR 合并，`status: Resolved`

### 🟡 复核：采纳 4 项，1 项归并，2 项判为不必改

逐条判过「是真问题还是洁癖」，只改判据站得住、且改法不引入新结构的。

#### 已采纳

| 项                 | 落点                                                                                        | 改法                                                                                                                  |
| :----------------- | :------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------- |
| `dispatch` 落空    | [electron-sqlite-host.ts](../../packages/rxdb-adapter-electron/src/electron-sqlite-host.ts) | 改穷尽 `switch` + `_exhaustive: never`，落空分支抛 `protocol_violation`。沿用 `getRxDBChangeEventType` 已有的同款写法 |
| `close` 记账用断言 | sqlite / file **两族** bridge                                                               | 抽 `readSessionId(request)` 进 `desktop-session-ownership.ts`，`denyForeignSession` 一并改用，断言消失                |
| 死 external        | [vite.config.mts](../../packages/rxdb-plugin-storage/vite.config.mts)                       | 删 `@aiao/rxdb-adapter-electron`，并注明它只属 vitest 那一处，别把两处混起来                                          |
| `pending` 文档不符 | [rxdb-react.tsx](../../packages/rxdb-react/src/rxdb-react.tsx)                              | 不改行为、不改名，改文案：写明取值是 source 的**形态**，且只在 `db === undefined` 时被读                              |

评审给 `close` 记账的建议是「从**应答**取 id」，未采纳：`close` / `file.close` 应答体里根本没有 `sessionId`，要照办就得改协议——而协议是 TS + Rust 双实现，为一处断言动线协议是过度设计。安全读请求即可，同一份 `readSessionId` 两族共用。

`dispatch` 的 `never` 分支运行期不可达（`parseDesktopHostRequest` 在前面就挡掉了未知 kind），覆盖率上表现为 3 行未覆盖 —— 它的价值在编译期：协议加了新 kind 而这里忘记补分支时，`tsc` 直接红，而不是把它当 `execute` 去读一个不存在的 `request.sql`。

#### 归并

无关变更拆分（`@types/pg` / `verdaccio` / `onlyBuiltDependencies`）是提交历史问题，随 squash 一并处理，不单独改代码。

#### 判为不必改

- **忙等 deadline 起算点**：选项就叫 `busyRetryBudgetMs`——「**重试**预算」，从首次失败起算与名字精确一致。改成请求起算反而让配置值与它字面意思不符。这条撤销。
- **`rxdb-adapter-tauri` 单测偏薄 / Angular `provideAppInitializer` 缺测**：都是补测试，判据成立但属独立工作量，不塞进本轮。另开。

#### 核实为已完成

Tauri 的「Rust 宿主自备」在 [README](../../packages/rxdb-adapter-tauri/README.md)（「⚠️ Rust 宿主需自备」）与 [desktop-split.md §5](../../website/docs/migration/desktop-split.md) 两处都写明，合入条件第 4 条无需再动。

#### 验证

（本轮改动范围内，非全量）`tsc --noEmit` 单独跑过 `rxdb-adapter-electron` 与 dev-rxdb-electron 的 serve / spec 两份 tsconfig，均无诊断；`dev-rxdb-electron` / `rxdb-adapter-electron` / `rxdb-react` 测试 765 passed；`rxdb-plugin-storage` build + test 通过，并确认 `dist/*.js` 内不含 `node:sqlite` / `rxdb-adapter-electron`（证明那条 external 确属死条目）；四个项目 lint 零警告。

### 🟠 #4 复核结论：误报，但同处挖出一个真缺陷

评审称 `desktop-host-protocol.ts` 把 64 MiB 当成了数组 blob 的**元素个数**上限。实际不是：
`SQLiteCompatibleType` 里的数组形态 blob 一个元素就是一个字节，host 侧的绑定路径是
`Uint8Array.from(binding)`（`node-sqlite-engine.ts:109`），因此 `length` 与 `Uint8Array` 分支的
`byteLength` 量纲相同，上限本就是字节数。未改上限，只在原处加注释说明量纲，避免日后被「修正」。

同一段代码上的真问题是另一件事：原校验只查 `typeof item === 'number'`，而 `Uint8Array.from`
对越界 / 小数 / NaN 一律**静默**按模 256 折回 —— `[300, -1, 1.5]` 会落库成 `[44, 255, 1]` 并报告成功。
已收严为 `isByteArray`（整数且 0..=255），信任边界不再替调用方改写字节。

## 破坏性 / 行为变化清单

按 [versioning-policy §5](../versioning-policy.md) 给出本分支合入时该打的级别。**判据一律是「相对 `origin/main`
已发布的表面」，不是「相对分支上某个中间提交」** —— 分支内加了又删的东西对使用者不可见，写进 release note
只会制造不存在的迁移负担。基线口径：`git merge-base HEAD origin/main` = `91cb5a1`。

### BREAKING CHANGE（主版本）

**`@aiao/rxdb-adapter-desktop@0.0.25` 被拆分下线**，由 `@aiao/rxdb-adapter-electron` 与
`@aiao/rxdb-adapter-tauri` 取代；`packages/rxdb-adapter-desktop/` 已从工作区移除，
`requirements/api-baseline/rxdb-adapter-desktop.json` 随之改名到 `rxdb-adapter-tauri.json`。

迁移：按宿主二选一换依赖与 import。两个新包的适配器选项、错误码与所有权规则与原包同源，
差异集中在 host 侧（Electron 走 `node:sqlite` + IPC，Tauri 走 Rust host + `invoke`）。

> 注意这一条与 §3 废弃周期的常规路径不同：原包**没有**经过「先标 `@deprecated` 保留一个次版本」
> 就直接移除。补偿手段是 registry 侧的 `npm deprecate`（E6），它把替代方案推到 `npm install` 的输出上。
> **该命令对外不可逆，仍等人工确认，未执行。**

### feat（次版本，纯加法）

| 包                               | 变化                                                                                        |
| :------------------------------- | :------------------------------------------------------------------------------------------ |
| `@aiao/rxdb-adapter-electron`    | 新包                                                                                        |
| `@aiao/rxdb-adapter-tauri`       | 新包（npm 侧只含 transport，Rust host 不经 npm 分发）                                       |
| `@aiao/rxdb-adapter-sqlite-core` | 新增子路径导出 `./desktop-host`；主入口未变                                                 |
| `@aiao/rxdb-angular`             | `provideRxDB` 入参放宽为 `RxDBSource`；新增 `useRxDB` / `useRxDBOptional` / `RxDBSource`    |
| `@aiao/rxdb-react`               | `db` prop 放宽为 `RxDBSource<T>`；新增 `useRxDBOptional` / `RxDBSource` / `UseRxDBOptional` |
| `@aiao/rxdb-vue`                 | `RxDBInput` 放宽为 `RxDBSource` 超集；新增 `useRxDBOptional` / `RxDBSource`                 |

三端的入参都是**放宽**（`() => RxDB` 与裸实例仍是新联合类型的成员），现存调用点无一需要改写。
`@aiao/rxdb` 的公开入口与 `main` **逐字节相同** —— `selectLocalBackend` 那一组四个导出是分支内
加了又撤回的，从未随 `main` 发布，不构成任何迁移。

### 行为变化（不破坏类型，但要写进 release note）

面向用户的版本已落在 [website/docs/migration/frameworks.md](../../website/docs/migration/frameworks.md)
的「升级绑定包」一节（第 1 / 2 / 4 条）；第 3 条由该文件「三框架 API 对照」表的「谁负责断开」一行承载。

1. **Angular：工厂的调用时机从惰性提前到 bootstrap 前。** 改动前 `() => RxDB` 在首次
   `inject(RxDB)` 时才执行；现在 `provideRxDB` 一并注册 `provideAppInitializer`，工厂在
   bootstrap **之前**执行。`inject(RxDB)` 的同步性不变，可观测差异只在「建库这件事发生得更早」。
   另：`provideAppInitializer` 只在**根**环境注入器生效，把 `provideRxDB` 挂到路由级 providers
   上且传异步 source 时没有人替你等，`inject(RxDB)` 会抛 `RxDB is not ready yet`。
2. **React：「有 Provider 但 `db` 为空」的报错文案变了。** 由
   `No RxDB instance found, use RxDBProvider to provide one` 改为
   `RxDBProvider received no database: …` —— 旧文案把人指回 Provider，而他们正用着 Provider。
   `db` 本就是必填，只有绕过类型检查才走得到这条；影响面是断言了旧文案的测试。
3. **三端：provider 现在会断开自己造出来的实例。** 传工厂 / Promise → 销毁时
   `disconnectAll()`；传已就绪实例或 Vue 的 `Ref` → 不碰。改动前 React / Vue 从不断开，
   但它们那时的 `db` 类型也压根不接受工厂，所以**现存用法无一受影响**；Angular 改动前后
   都断开工厂产物，语义不变。
4. **React：`disconnectAll()` 推迟一个微任务。** `StrictMode` 的「卸载 → 再挂载」落在同一批
   同步提交里，租约要等过一拍才知道有没有人接手（见 `rxdb-react.tsx` 的 `closeLease`）。
   影响面同样是测试：`unmount()` 之后需 `await waitFor(...)` 才观察得到断开。

### 不进 release note 的（记在这里免得被重新捡回去）

🟠 #2（`#onMessage` 不再同步抛进传输层）、#5（`$bigint` 收严为 canonical 十进制，两端同时拒
`+1` / `007` / `-0` / `0x10` / 空白 / 空串）、#4 旁边的 `isByteArray` 收严，都落在
`packages/rxdb-adapter-sqlite-core/src/desktop/`、`rxdb-adapter-electron`、`rxdb-adapter-tauri` ——
这三处在 `main` 上**都不存在**，属于本分支的新代码。它们是「新包首发时的正确行为」，
不是对已发布行为的收紧，写成迁移说明会误导使用者去找一段他们从未写过的代码。
