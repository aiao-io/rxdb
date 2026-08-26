---
id: RV-002
title: US-213 / US-214 故事评审：RV-001 修订复核通过，US-214 有两条 AC 按现文无法诚实关闭
status: Open
created: 2026-08-26
updated: 2026-08-26
pr: # 修复 PR 链接，Resolved 时填
---

# Review：US-213 / US-214 故事评审

## 结论摘要

两个文件各评一遍：

- **[US-213](../stories/adapter/US-213-http-wire-integration-test.md) 是 RV-001 修订后的版本**，RV-001 提出的 2 个 P1、4 个 P2、6 个 P3 共 12 条全部落地（逐条核对见下），故事可以开工。剩 2 个 P3 文案问题：桩计数「12」仍失真（实为 9 处 fetch 桩 / 11 处 `vi.stubGlobal`），以及 RV-001 的引用链接已随删档失效。
- **[US-214](../stories/adapter/US-214-http-browser-demo.md) 骨架扎实**（分工表、CORS 技术断言、默认配置论证都是高质量），但有 **2 个 P2**：AC#4 的「短页只出现在末页」在 250 行种子下**一条都观测不到**（250 = 5×50，五页全是满页）；AC#17 的 `run-many` 要求 e2e project 具备 `lint typecheck test build` 四个 target，而仓库既有 e2e project 只有 `e2e`，按现文这条 AC 跑不起来。另有 2 个 P3（端口占用表失真、curl 认证口径未写死）。建议 P2 修完再排期开工。

全部为文档问题，不涉及代码；设计方向（真实网线测试、浏览器 demo 的定位与边界）本身不需要变。

## 核实清单

以下断言逐条对照源码 / 文档 / git 历史复验：

| #   | 断言                                                  | 核实结果                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | US-213 已按 RV-001 修订（12 条）                      | ✅ 全部落地：P1-1 → 改为「9 个 spec 里 6 个含 fetch 桩」；P1-2 → [http-protocol.md](../../website/docs/adapters/http-protocol.md) 已有「条件请求（可选）」节（含 `ETag` / `If-None-Match` / `304` 语义表）+ 验收清单一条「若实现了条件请求：内容一旦变化就不得再回 304」；P2-1 → 「两类驱动方式」表；P2-2 → AC#10 / #11 前置条件显式配 `templates.version` / `templates.isTableExisted` + 默认 harness 说明；P2-3 → 三处纳管理由改写（`coverage.include` 直接结果、eslint 依赖理由）；P2-4 → hookTimeout 因果改写为 `faults.hang` 半开连接；P3-1~6 全中 |
| 2   | 「共 12 处调用点」                                    | ❌ 见 P3-1。实为 **9 处 fetch 桩**（RxDBAdapterHttp 4、integration 1、chunking / pagination / rest / transport 各 1）、**11 处** `vi.stubGlobal` 全量（integration 另有 `indexedDB` / `navigator` 2 处非 fetch 桩）。零桩三件套（config / conditional-cache / metadata）表述正确                                                                                                                                                                                                                                                                        |
| 3   | `HttpTransport.#send` 用全局 `fetch`、无注入点        | ✅ [transport.ts](../../packages/rxdb-adapter-http/src/transport.ts) 的 `#send` 内 `await fetch(request.url, …)`；`#cacheAndReturn` 的 `const etag = response.headers.get('etag')` + `etag === null → cache.delete(key)` 与 US-214 引用一致；`classify` 是 private 方法；非 2xx 抛 `HttpResponseError(response.status, …)`（数字 status）；传输失败归 `NetworkOfflineError`、断开归 `HttpDisconnectedError`                                                                                                                                             |
| 4   | 三处纳管现状                                          | ✅ `tsconfig.spec.json` include 无 `tests/**`；`eslint.config.mjs` 的 `@nx/dependency-checks.ignoredFiles` 只有 `{projectRoot}/src/__tests__/**`；`vite.config.mts` 的 `test.include` 已含 `tests/**`（无需改）、`coverage.exclude` 只有 `['**/__tests__/**','**/dist/**']`、`environment: 'node'`（undici 断言成立的前提）                                                                                                                                                                                                                             |
| 5   | `DEFAULT_HTTP_CONFIG` 默认值                          | ✅ [config.ts](../../packages/rxdb-adapter-http/src/config.ts) `pageSize: 1000, idChunkSize: 100`，与 US-214「默认配置会让 demo 白跑」的引用一致；250 行确实一次请求就翻完                                                                                                                                                                                                                                                                                                                                                                              |
| 6   | US-212 交叉引用（Done / AC#7 / #9 / #24 / #28 / #34） | ✅ US-212 frontmatter `status: Done`；AC#24（version 不回落包版本号）、AC#28（条件请求）、AC#34（超时可区分）原文存在；AC#7 / #9 已由 RV-001 核实且 [chunking.spec.ts](../../packages/rxdb-adapter-http/src/__tests__/chunking.spec.ts) 确有 `describe('失败与少行是两件事（AC#9）')`                                                                                                                                                                                                                                                                   |
| 7   | `rest.ts` 模板语义（US-213 AC#2 / #10 / #11 的前提）  | ✅ `REST_OPERATIONS` 中 `version` / `isTableExisted` 无默认路径（缺省不产出 handler，`isTableExisted` 缺省复用 `limit: 1` 探测）；`onFetchMetadata.request` 发 `{ where, offset, limit, pageToken }` 且注释写明「pageToken 为 undefined 时 JSON.stringify 直接丢键」                                                                                                                                                                                                                                                                                    |
| 8   | 协议文档现状（两故事共同的锚点）                      | ✅ `http-protocol.md`：7 端点 / 2 必选；短页即末页、`POST :entity/delete` + `{ ids }`、`HEAD` 探测、version 不回落、token 快照一致性（「任一保证做不到 → 用 token 形态」）逐条与两故事引用一致；**全文无任何 CORS 内容**（US-214 AC#12 前提成立）；curl 示例恰为五条，字段 `title` / `status` / `price` / `tag` 与 AC#2 要求同名                                                                                                                                                                                                                        |
| 9   | COOP / COEP 现状                                      | ✅ [dev-rxdb-angular/project.json](../../apps/dev-rxdb-angular/project.json) 的 `serve` 有 `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`；[dev-rxdb-supabase/project.json](../../apps/dev-rxdb-supabase/project.json) 的 `serve` 无这两个头——US-214「不抄 angular、跟 supabase 走」的引用准确                                                                                                                                                                                                                |
| 10  | 派生视图三处「已随本文件落地」                        | ✅ epic-004 清单行、roadmap 批次 3 行 + 约束 13 / 14、status-overview 行 176 / 177 均已存在；`stories/*/US-*.md` 文件数 = 57，与汇总表「合计 57 / Backlog 10」一致                                                                                                                                                                                                                                                                                                                                                                                      |
| 11  | US-214 端口占用表                                     | ❌ 见 P3-3。vue 实际配 4203（与 supabase 撞），4202 无人使用                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 12  | 250 行 × pageSize 50 的翻页算术                       | ⚠️ 5 次请求成立，但见 P2-1：五页全是满页，「短页只出现在末页」无页可证                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 13  | e2e project 的 target 现实（AC#17 的前提）            | ❌ 见 P2-2。仓库既有 [dev-rxdb-supabase-e2e/project.json](../../apps/dev-rxdb-supabase-e2e/project.json) 只有 `e2e` / `e2e-remote` 两个 target                                                                                                                                                                                                                                                                                                                                                                                                          |
| 14  | RV-001 引用链接                                       | ❌ 见 P3-2。文件已在 HEAD（`967263d`）删除                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 15  | References 其余链接                                   | ✅ `dev-rxdb-supabase` 的 `setup_rxdb_wa-sqlite.ts` / `remote-sync-state.ts` / `app-header.ts` / `runtime-config.ts` 四文件均在；[sqlite-script.ts](../../packages/rxdb-adapter-electron/src/sqlite-script.ts) 存在（`node:sqlite` 先例成立）；[http.md](../../website/docs/adapters/http.md) 有「条件请求」一节（`conditionalCacheSize` 表 + 「让没变的页不再传一遍」）                                                                                                                                                                                |
| 16  | US-214 的 CORS / ETag 技术断言                        | ✅ 全部正确：`Content-Type: application/json` 不在 CORS 安全列表 → `POST :entity/metadata` 必预检；`PATCH` 不在安全方法 → 必预检；`If-None-Match` 非安全列表头 → 必须在 `Access-Control-Allow-Headers`；`ETag` 不在默认暴露集合（Cache-Control / Content-Language / Content-Length / Content-Type / Expires / Last-Modified / Pragma）→ 跨源下 `headers.get('etag')` 恒 `null`，且 [transport.ts](../../packages/rxdb-adapter-http/src/transport.ts) 该分支确为零日志静默                                                                               |

## 问题清单

### P2-1（US-214）AC#4 的「短页只出现在末页」在 250 行种子下一条都观测不到

**问题。** AC#4 前置条件「表内 250 行、前端 `pageSize: 50`」，预期列承诺「后端每页 `rows.length === limit` 直至真末页，**短页只出现在末页**……（250 行 = 5 次请求）」。250 = 5 × 50，五页全是满页，**任何一页都不是短页**——这条断言没有任何观测路径，实现者要么把种子改成非整倍数（与 AC#6 的「250 行」冲突），要么把该子句当摆设。

**根因。** 种子行数选 250 时只对照了「翻页路径会不会发生」（5 页 ✓），没有对照「末页是满页还是短页」。短页截断恰恰是协议最危险的边界——US-213 为此专门用 AC#5 固化「短页即末页是契约」用例，而本故事的卖点就是这些边界「在 demo 里当场发生、当场看见」。

**修复方案（二选一，推荐 a）。**

- (a) 种子 250 → **253**（5 满页 + 1 短页，末页 3 行），同步改 AC#4 前置条件、AC#6 的「250 行」与技术笔记「250 行 → 5 页 metadata」的引用。改动小，全量查询直接可见。
- (b) 保留 250，在 AC#4 追加一条过滤查询（行数为非 50 倍数，如 `status=published` 的 247 行）专门验证短页只出现在末页。

### P2-2（US-214）AC#17 的 `run-many` 对 e2e project 没有可跑的目标

**问题。** AC#17 要求 `pnpm nx run-many -t lint typecheck test build --projects=dev-rxdb-http,dev-rxdb-http-server,dev-rxdb-http-e2e` 全绿。仓库既有 e2e project（[dev-rxdb-supabase-e2e/project.json](../../apps/dev-rxdb-supabase-e2e/project.json)）只有 `e2e` / `e2e-remote` 两个 target；[nx.json](../../nx.json) 的推断插件里 `build` / `typecheck` 来自 `@nx/js/typescript`（需 tsconfig）、`test` 来自 `@nx/vitest`（需 vitest 配置）、`e2e` 来自 `@nx/playwright`，一个只装 playwright 的 e2e project 拿不到 `build` / `test`，且插件列表里没有 `@nx/eslint`（`lint` 需在 project.json 显式声明）。Nx 的 `run-many` 对列出的 project 缺 target 直接报错——按现文这条 AC 跑不起来。

**根因。** AC 把「三个新 project 统一过门禁」写成了一个单一 `run-many`，但三个 project 类型不同（Angular app / node app / playwright e2e），target 集合天然不同。实现文件表给 server 写了 `serve/seed/reset/lint/test/typecheck` targets，却没有给 e2e project 写对应行。

**修复方案。** 拆成按类型的门禁矩阵：`dev-rxdb-http` 与 `dev-rxdb-http-server` 跑 `lint typecheck test build`；`dev-rxdb-http-e2e` 的门禁就是 AC#16 的 `e2e` 全绿（如需 lint / typecheck，在实现文件表补写显式 target 行）。AC#17 正文与实现文件表同步改。

### P3-1（US-213）「共 12 处调用点」仍失真

**问题。** 两处仍写 12：技术笔记「9 个 spec 文件里有 6 个用 `vi.stubGlobal('fetch', …)` 打桩（共 12 处调用点）」，分工表段「本包 `src/__tests__/` 下有 12 处既有桩（分布在 6 个文件）」。实测 fetch 桩 9 处（[RxDBAdapterHttp.spec.ts](../../packages/rxdb-adapter-http/src/__tests__/RxDBAdapterHttp.spec.ts) 4、integration 1、chunking / pagination / rest / transport 各 1）；`vi.stubGlobal` 全量 11 处（integration 另有 `indexedDB` / `navigator` 2 处）。无论按哪个口径，12 都不对。

**根因。** 该数字继承自 RV-001 的修订文案——RV-001 把 transport 数成 2（多算的是 [transport.spec.ts](../../packages/rxdb-adapter-http/src/__tests__/transport.spec.ts) 行 22 注释里带反引号的 `vi.stubGlobal` 字样），修订时原文照抄未复核。派生视图（status-overview 行 176、roadmap 行 15）当时只写了「6 个在 `vi.stubGlobal('fetch')` 层拦截」不带总数，反而没有继承这个错。

**修复方案。** 两处统一改为「共 9 处 fetch 桩（integration 另有 indexedDB / navigator 2 处非 fetch 桩）」；或只写「6 个文件含 fetch 桩」不带总数。核心结论「真实 transport 从未被真实网线打过」不受影响。

### P3-2（US-213）RV-001 引用已随删档失效，且 RV 编号复用让引用不可定位

**问题。** In Scope 引用 `../../reviews/RV-001-us-213-story-review.md` 并称条件请求节「已随 RV-001 先行落地」，但该文件已在 HEAD（`967263d`）删除；git 历史里有至少 4 个不同的「RV-001」文件（us-213-story-review / supabase-error-classification / gate8-prefix / desktop-host），`RV-001 起递增` 被「修复即删档、编号重启」的实践打破。「已随 RV-001 先行落地」的物质断言成立（`http-protocol.md` 条件请求节 + 验收清单一条确实存在），但链接点开是 404，违反 CONVENTIONS「一次跳转内独立复验」。

**根因。** [capability-matrix.md](../capability-matrix.md) 明文「RV-001 `Fixed` 后删档」——删除已修复记录是本仓现行实践；story 引用 review 记录时两者直接冲突（US-207 引用的 RV-001 / RV-003 同样已失效，这是系统性的，不止 US-213 一处）。

**修复方案（二选一）。**

1. 在 US-213 里删掉该链接，改指 [http-protocol.md](../../website/docs/adapters/http-protocol.md) 的「条件请求（可选）」节——物质锚点不会被删，且「开工时不要重复新增」的指令依然可复验。
2. 若要保留评审追溯，在 [reviews/README.md](README.md) 约定「被 story 引用的 review 记录不删档」，并把 RV-001-us-213-story-review.md 恢复（git 历史里有原文件）。

顺带建议在 README 补一句编号复用规则（删档后编号是否重启），避免「RV-001」在 git 历史里指向四个不同文件继续造成困惑。

### P3-3（US-214）端口占用表失真：vue 实为 4203，与 supabase 同端口

**问题。** 技术笔记「现有占用：4200 angular / 4201 react / 4202 vue / 4203 supabase」——实测 [dev-rxdb-vue/vite.config.mts](../../apps/dev-rxdb-vue/vite.config.mts) 的 `server.port: 4203`，与 supabase **同端口**；4202 无人使用。这顺带暴露一个现存小问题：vue 与 supabase 已经撞了 4203。

**根因。** 可能沿用了「angular 4200 / react 4201 / vue 4202 / supabase 4203」的期望分配，未逐个 grep 实配（react 的 4201 在 [vite.config.mts](../../apps/dev-rxdb-react/vite.config.mts) 行 62、vue 的端口在 server 块，都不在 project.json 里）。

**修复方案。** 括号改为「4200 angular / 4201 react / 4203 vue 与 supabase（两者同端口，历史遗留）」。结论不变：4300 / 4301 无人占用，本故事端口选择不受影响。

### P3-4（US-214）AC#2 五条 curl 的认证口径未写死

**问题。** AC#2 要求 `http-protocol.md`「端到端示例（curl）」五条命令「逐字可跑」，但五条里只有第一条带 `Authorization: Bearer <token>`；故事只说后端「只校验它存在」，没说「header 缺席时放行还是 401」。若后端对所有端点强制校验，其余四条命令逐字执行会 401，「五条逐字可跑」当场挂。

**根因。** Out of Scope 写「真实身份认证……后端只校验它存在」时没有把「缺席」的语义定死。

**修复方案。** 在 AC#2 前置条件或技术笔记补一句：demo 后端把 `Authorization` 视为「存在才校验、缺失也放行」（演示态），保证五条 curl 与页面请求都能跑；或若想演示鉴权失败路径，把「缺失 → 401」写进 AC#2 的对照预期并同步调整 curl 命令。

## 做得好的地方

- **US-213 对 RV-001 的修订是完整落地的。** 12 条（2 P1 / 4 P2 / 6 P3）逐条核对全中，且保留了原文最好的两个设计：「短页即末页是契约不是 bug」的用例命名策略（防未来有人把它当红测试来「修」），和协议缺陷处置预案（`it.fails` / `describe.skip` + 另开 US，不迁就客户端）。
- **US-214 的分工表论证干净。** 「与 US-213 各建各的后端、互不复用」用三件「只有浏览器能证的事」（CORS、RuleGroup→SQL、真本地行缓存）立论，最后一句「两份独立实现本身也是证据」把故意重复升格为方法论。
- **CORS / ETag 技术断言全部正确。** 预检触发点四条、`Access-Control-Expose-Headers: ETag` 是条件请求在浏览器可用的前置、`#cacheAndReturn` 的 null 分支零日志静默——都是对照源码与 CORS 规范可复验的硬断言，没有「大概如此」。
- **「默认配置会让 demo 白跑」一节把调参升格为 AC 级约束。** `pageSize: 50` / `idChunkSize: 20` 不是偏好，是「翻页与分块两条路径会不会在 demo 里真实发生」的分水岭，写进 AC 而不是留给实现者临场决定。
- **COOP / COEP 一段符合「结论必须写出复验方式」规范。** 推断显式标注为**推断**，并给出「不开就没有歧义」的成本论证。
- **派生视图三处「已随本文件落地」全部属实。** 计数（57 文件 / Backlog 10 / 合计 57）与推导口径一致，roadmap 约束 13 / 14 与 epic 说明互相呼应。

## 结论

US-213 已基本定稿，剩 P3-1、P3-2 两个文案修正，修完即可排期开工。US-214 骨架扎实，但 P2-1（短页断言不可观测）与 P2-2（AC#17 门禁矩阵跑不起来）会让两条 AC 无法被诚实关闭，建议连同两个 P3 一起修完再排期。全部是文档编辑，预计一小时内可完成。

## 解决记录

- [x] US-213：修正两处桩计数（P3-1，12 → 9）、RV-001 引用改指
      [`http-protocol.md`「条件请求（可选）」](../../website/docs/adapters/http-protocol.md)（P3-2，取修复方案 1）
      —— 2026-08-26 随 [RV-003](RV-003-us-213-deep-story-review.md) 的处置一并落地
- [ ] US-214：种子行数或 AC#4 补过滤查询（P2-1）、AC#17 拆成按类型的门禁矩阵并同步实现文件表（P2-2）、端口表修正（P3-3）、curl 认证口径写死（P3-4）
- [ ] PR 合并，`status: Resolved`
