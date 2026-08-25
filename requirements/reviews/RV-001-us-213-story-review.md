---
id: RV-001
title: US-213 故事评审：spec 计数失真已扩散、ETag 缺协议锚点、测试 harness 未写死
status: Open
created: 2026-08-25
updated: 2026-08-25
pr: # 修复 PR 链接，Resolved 时填
---

# Review：US-213-http-wire-integration-test.md 故事评审

## 结论摘要

故事骨架扎实：INVEST 齐全、17 条 AC 与 US-212 的交叉引用（AC#2 / #7 / #9 / #24 / #28 / #34）逐条对得上实文、三个派生视图（epic-004 / status-overview / roadmap）已同步、大部分现状断言可复验。发现 **2 个 P1、4 个 P2、6 个 P3**，全部是文档问题、不涉及代码。建议 P1 与 P2 修完再排期开工，测试资产的设计方向本身不需要变。

## 核实清单

以下断言逐条对照源码 / 文档复验：

| # | 故事断言 | 核实结果 |
| --- | --- | --- |
| 1 | 「本包 7 个 spec 全部用 `vi.stubGlobal('fetch')` 打桩」（行 16 / 81 / 161 / 166） | ❌ **不符**。`src/__tests__/` 下共 **9** 个 spec 文件；`vi.stubGlobal` 共 **12** 处调用点、分布在 **6** 个文件（RxDBAdapterHttp 4、integration 3、transport 2、chunking / pagination / rest 各 1）；`config.spec.ts` / `conditional-cache.spec.ts` / `metadata.spec.ts` 是零桩纯单元测试。9 个文件同日（2026-08-25，提交 a63321c）一次性落地，「7」从起草时起就不准确，不是过期计数 |
| 2 | 「`HttpTransport.#send` 用的是全局 `fetch`，无 import 注入」 | ✅ `transport.ts` 的 `#send` 内 `await fetch(request.url, …)`，无注入点 |
| 3 | `createLocalAdapter` 是 `integration.spec.ts` 里未导出的局部 const，该文件零 export | ✅ 行 207 `const createLocalAdapter = …`；`grep ^export` 无结果 |
| 4 | `vite.config.mts` 的 `test.include` 已含 `tests/**`，无需改动 | ✅ 行 63 `include: ['{src,tests}/**/*.{test,spec}.…']` |
| 5 | tsconfig / eslint / coverage 三处只认 `src/__tests__/` | ✅ `tsconfig.spec.json` include 无 `tests/**`；`eslint.config.mjs` 的 `@nx/dependency-checks.ignoredFiles` 只有 `{projectRoot}/src/__tests__/**`；`vite.config.mts` 的 `coverage.exclude` 只有 `['**/__tests__/**','**/dist/**']` |
| 6 | US-212 已 `Done`，AC#7 四 fail-fast / AC#9 少行不补空 / AC#24 version 不回落 / AC#28 条件请求 / AC#34 超时可区分 | ✅ 全部对得上 US-212 实文；`conditionalRequests` / `conditionalCacheSize` 配置键、`fetchAllMetadataPages` / `findByIdsInChunks` 符号均存在 |
| 7 | 协议：七个端点、短页即末页、`POST :entity/delete` + `{ ids }`、`HEAD` 探测、version 不回落包版本号 | ✅ 与 `http-protocol.md` 逐条一致；`rest.ts` 默认 delete 模板确为 `{ method: 'POST', path: ':entity/delete' }` |
| 8 | 派生视图三处「已随本文件落地」 | ✅ epic-004 清单行、roadmap 批次 3 行 + 约束 13、status-overview 行均已存在；计数 Backlog 9 / 合计 56 与 grep 推导口径一致 |
| 9 | 「direct close() 会一路挂到 hookTimeout: 10000 超时」 | ⚠️ 见 P2-4 |
| 10 | ETag / 304 属于「wire 级协议不变量」 | ❌ 见 P1-2 |

## 问题清单

### P1-1 「7 个 spec 全部用 `vi.stubGlobal('fetch')`」与事实不符，且已扩散到两个派生视图

**问题。** 故事的四处数字全部失真，且同一句错误已被复制进两个派生视图：

- [US-213-http-wire-integration-test.md](../stories/adapter/US-213-http-wire-integration-test.md)：行 16（INVEST Valuable）、行 81（技术笔记首段）、行 161（分工表）、行 166（「`src/__tests__/` 下有 7 处既有桩」）。
- [status-overview.md](../status-overview.md)：行 176「本包 7 个 spec 全在 `vi.stubGlobal('fetch')` 层拦截」。
- [roadmap.md](../roadmap.md)：行 15（批次 3 排期行的「背景」列）同句。

**根因。** 起草时对 spec 文件做了不完全盘点。9 个文件同日在提交 a63321c 落地，其中 `config` / `conditional-cache` / `metadata` 三个纯单元 spec 根本不需要桩，「全部用 `vi.stubGlobal('fetch')`」对任何子集都不成立（含 fetch 桩的只有 6 个文件）。

**修复方案。** 四处统一改为：「9 个 spec 文件中 6 个含 fetch 桩（共 12 处 `vi.stubGlobal` 调用点），`config` / `conditional-cache` / `metadata` 三个是零桩纯单元测试」；同步修 status-overview 与 roadmap 两处。注意：核心结论「真实 transport 从未被真实网线打过」仍然成立（三个零桩 spec 不经过 transport），修计数不修结论。

### P1-2 AC#16 的 ETag / 304 在 `http-protocol.md` 里没有服务端语义

**问题。** 故事定位是「后端照协议实现、前端照协议消费」的可执行验收，并把「ETag/`If-None-Match` 304」列进 wire 级协议不变量（行 37）。但 [http-protocol.md](../../website/docs/adapters/http-protocol.md) 全文 351 行**没有任何** ETag / `If-None-Match` / 304 的规定；仅 [http.md](../../website/docs/adapters/http.md)（适配器使用文档，行 224-235）记载了客户端侧 `conditionalRequests` 行为。参考后端的 ETag 行为（何时发、发什么值、如何认 `If-None-Match`）因此是测试作者自创的——AC#16 证不了「后端照协议实现」，实际证的只有 US-212 AC#28 的客户端契约。这正是故事自己批判的「桩永远假设两者本来就对得上」（行 90-92）的失败模式，只是把 fetch 桩换成了协议外发明。

**根因。** US-212 阶段 B 交付 AC#28 时更新了 `http.md` 的客户端文档，但没有把服务端语义回写进 `http-protocol.md`——后者是「给任意后端看的协议规范」，条件请求从此成为客户端单边特性。

**修复方案（二选一，推荐都做）：**

1. 给 `http-protocol.md` 补一节「条件请求（可选）」的服务端语义：2xx 时发 `ETag`；客户端带 `If-None-Match` 时回 `304`（无 body）或 `200` + 新 `ETag`；304 语义 = 客户端持有版本仍有效。这是文档改动、不属于 `src/`，与「纯测试资产」边界不冲突，但要在故事的 In Scope 与实现文件表各加一行，写明这是本故事允许的唯一 docs 改动。
2. 把 AC#16 重新定位：预期列写明「这是 US-212 AC#28 客户端契约的真实网线验证；服务端 ETag 语义为本参考后端自定，待协议文档补齐后成为协议验收」，并把行 37 清单里的 ETag 条目移出「协议不变量」。

### P2-1 前置条件没写测试 harness 层级，多条 AC 的预期落在 core 层

**问题。** 行 53 的前置条件统一定义只写「把 `baseUrl` 传给 `RxDBAdapterHttp`」，但：

- AC#8 操作列是「增量 pull」、AC#13 预期「不被 `offlineFallback` 吞成缓存命中」、AC#15 预期「断开判 `false` 不降级」——`offlineFallback` 是 core `QueryCacheRepository` 的行为，纯适配器直调只能断言错误类型、数字 `status` 与 `isNetworkError` 判值，观测不到「吞不吞」。
- 实现文件表里的 `local-adapter.fixture.ts`（带 `getMetadataByIds` / `upsertMany` / `deleteByIds`）只有 core 的 `QueryCacheRepository` 消费（US-212 行 50），说明 harness 实际要走 core 全栈——与前置条件的描述不符。

**修复方案。** 在前置条件段补一段 harness 描述，写明两类驱动方式与各自覆盖的 AC：① 适配器直调（`version()` / `isTableExisted()` 及 transport 级断言）；② core 栈（`RxDB` + `SyncType.QueryCache` + 本地 fixture 适配器注册，覆盖增量 pull、offlineFallback 相关 AC）。把「`beforeAll` 已启动参考后端…并把 `baseUrl` 传给 `RxDBAdapterHttp`」扩成完整的两段式 harness 描述。

### P2-2 AC#10 / AC#11 的前置条件缺客户端模板配置

**问题。** `rest.ts` 行 81 注释写明「`version` / `isTableExisted` 的默认是『不产出』」，行 119 写明缺省路径是「复用 `onFetchMetadata` 的 `limit: 1` 探测」。因此：

- AC#11 要断言「后端实收的方法是 `HEAD`，不是复用 `limit: 1` 的 `POST`」，测试**必须**显式配 `templates.isTableExisted`（如 `{ path: ':entity' }`）——不配的话客户端缺省行为就是 `limit: 1` 探测，断言必挂。
- AC#10 的「配了 `templates.version` 则透出后端版本」分支同样依赖显式配置，而「未配时抛 unsupported」分支正好复用缺省——两个分支的前置条件不同，AC 表里没有区分。

**修复方案。** AC#10 / #11 的前置条件列补上模板配置；AC#10 拆写两个分支的前置条件（或在前置条件段统一定义「配了 `templates.version` / `templates.isTableExisted`」的默认 harness）。

### P2-3 「三处纳管」的 coverage 理由不成立（结论无害，理由要改）

**问题。** 行 205 说「当前靠 `coverage.include: ['src/**/*']` 侥幸兜住，依据不该是侥幸」——这不成立。`coverage.include` 就是覆盖率分母的定义来源，`tests/**` 不在分母里是**显式配置的直接结果**，不是侥幸。真正的理由应该是：把 `tests/**` 写进 `coverage.exclude` 是显式声明意图，防止将来有人放宽 `include` 时测试资产被计入分母。

另外，eslint 纳管行（行 204）缺理由：`tests/reference-server.ts` 会 import `node:http` 与 vitest，`@nx/dependency-checks` 会把它们当未声明依赖报错——与 `src/__tests__/**` 同因，补一句即可。

**修复方案。** 三处纳管表只修理由文字，动作不变。

### P2-4 「直接 `close()` 会一路挂到 `hookTimeout`」与 Node ≥ 19 事实有出入

**问题。** 行 186-188 断言 undici keep-alive 会让 `server.close()` 挂满 `hookTimeout: 10000`。从 Node 19 起 `server.close()` 会自动关闭空闲连接；undici keep-alive 连接在响应 body 消费完后处于空闲态，会被 `close()` 收掉。本仓库硬性要求 Node 26，该风险基本不存在。`closeAllConnections()` 先行的建议本身无害且是好防御（AC#15 的 `faults.hang` 会留下半开连接），但「必挂 hookTimeout」的因果是错的。

**修复方案。** 保留「先 `closeAllConnections()` 再 `close()`」的动作，把理由改准：「防 `faults.hang` 类用例留下的半开连接拖住 `close` 回调」之类。

### P3（可选）

- **P3-1** AC#7 写「后端按 `faults` 制造四种退化响应」，但 `faults` 接口只有 `shapeSwitchAt` / `tokenStuck` 与「换形态 / token 不推进」对应；「连续空页」靠服务端返回空 `rows` + token 与客户端 `maxEmptyPages` 配置，「总页数触顶」靠服务端满页 + 客户端小 `maxPages`。措辞放宽为「按 `faults` 与服务端行为」。
- **P3-2** 行 193 引用「`HttpTransport.classify()`」——`transport.ts` 里 `classify` 是 **private** 方法，用例只能经 `sendJson` / `execute` 间接观测；作为实现注释引用没问题，但别让实现者以为它是可直调的断言入口。
- **P3-3** AC#2 断言「body 反序列化后是 `{ where, offset, limit }`」——`rest.ts` 行 348 的实际形状是 `{ where, offset, limit, pageToken }`，首页 `pageToken = undefined` 被 `JSON.stringify` 丢弃所以断言成立；建议断言写明「首页（`pageToken` 缺省）」，避免读者误解协议请求体不含该字段。
- **P3-4** 技术笔记（行 140-141）声明参考后端实现算子子集含「`!=` / 大小比较」，但 AC#3 操作列只练 `=` / `in` / `between` / `contains` / `null`——声明比验收宽，两者其一要改。另外「`contains` 的大小写」（行 144）被列为翻译风险，但协议没有规定大小写语义，参考后端应在注释里写明自选立场（建议 case-sensitive），否则「逐 id 相等」的对照口径会在两边各自漂移。
- **P3-5** AC#1 的「无句柄泄漏」没写断言机制（如 `stop()` 的 `close` 回调完成、`process._getActiveHandles()` 计数），建议明确。
- **P3-6** 行 82-83「在 handler 层拦截等于拿被测对象的输入冒充它的输出」读不通：现有桩拦在 fetch 层（transport 输出），正是 US-212 AC#2 要的拦截点；该句应为「**若**在 handler 层拦截」，否则与前文「这是正确的」自相矛盾。

## 做得好的地方

- **交叉引用零虚指。** AC#7 四 fail-fast、AC#9 少行不补空、AC#24 不回落、AC#28 条件请求、AC#34 超时可区分，全部对得上 US-212 实文；符号名（`fetchAllMetadataPages` / `findByIdsInChunks` / `conditionalRequests`）逐一存在。
- **AC#5 的「短页即末页是契约不是 bug」设计。** 把已知数据丢失行为固化成「协议边界、非缺陷」的命名 + 注释策略，防未来有人把它当红测试来「修」，是本故事最好的设计之一。
- **端口分配段的实操建议全部正确。** `listen(0)` + `await listening`、拒连用 `http://127.0.0.1:1` 或 `socket.destroy()`（替代「listen→close→复用端口」的竞态写法）都是 CI 上真实会咬人的坑。
- **派生视图同步完整。** 三处落地与计数（Backlog 9 / 合计 56）一致；「状态流转」行写明 YAML 是唯一真相源，符合 CONVENTIONS。
- **本地 fixture 自带一份的边界决策。** 不复用、不抽取的理由（`src/__tests__/` 零 export、不改既有测试）与「纯测试资产」边界自洽。
- **协议缺陷处置预案。** `it.fails` / `describe.skip` + 另开 US，防「改参考后端迁就前端」，与 roadmap 约束 13 呼应。

## 结论

P1-1、P1-2 必改（前者是已扩散的事实错误，后者动摇了「协议互通验收」的定位），P2-1、P2-2 必改（否则实现时直接撞墙：core 层断言测不到、HEAD 断言必挂），P2-3、P2-4 顺手改，P3 可选。全部是文档编辑、不涉及代码，预计一小时内可完成；修完即可按 Backlog 排期开工。

## 解决记录

- [ ] 按上述清单修改故事与两个派生视图（`pr` 字段记录链接）
- [ ] PR 合并，`status: Resolved`
