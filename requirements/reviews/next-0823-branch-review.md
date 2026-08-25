---
id: branch-review-next-0823
title: next-0823 分支（vs main）全量代码评审
status: Open
created: 2026-08-24
updated: 2026-08-25
pr: # 修复 PR 链接，Resolved 时填
---

# `next-0823` 相对 `main` 分支全量代码评审报告

> **评审对象**：分支 `next-0823` vs `main`（22 个提交 / 120 个文件 / +16,407 −6,917 行）
> **评审日期**：2026-08-25
> **评审方式**：逐项审阅差异、核对需求契约与相邻实现，并执行关联测试、类型检查和审计门禁

## 1. 范围与背景

本分支主要包含以下变更：

| 内容 | 说明 |
| :--- | :--- |
| US-212 HTTP 远程适配器 | 新增 `@aiao/rxdb-adapter-http`，包含 transport、REST handler、分页、分块、条件缓存、metadata、配置与错误契约 |
| US-018 生成器 default 语义 | 运行时类型分派序列化，并为不可表达的值增加生成期错误 |
| US-601 子路径 API 基线 | API surface / subpath inventory 审计与基线迁移 |
| Supabase 错误契约 | 传输失败统一归类为 core 的 `NetworkOfflineError` |
| QueryCache / adapter 契约 | 幂等收敛、发射契约和相关 TSDoc 更新 |

## 2. Findings

### P1：合入前必须修复

#### P1-1 HTTP wire 类型扫描遗漏外键目标实体的 `bigint` / `binary`

- **位置**：[RxDBAdapterHttp.ts:454](/Users/jimmy/Documents/aiao/rxdb_ai/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:454)
- `findUnsupportedProperty()` 只遍历当前实体的 `metadata.propertyMap`，没有遍历 `foreignKeyRelationMap` 并解析目标实体主键类型。
- 因此当前实体本身没有不支持字段、但外键目标实体的 `id` 是 `bigint` 或 `binary` 时，`connect()` 会错误放行；后续经 HTTP 传输时可能发生 `bigint` 序列化异常，或 `Uint8Array` 被静默变成普通对象。
- Supabase 已有正确的外键扫描实现，可复用相同判定口径：[supabase.helpers.ts:95](/Users/jimmy/Documents/aiao/rxdb_ai/packages/rxdb-adapter-supabase/src/supabase.helpers.ts:95)。

#### P1-2 REST create/update 回执校验把数组当成实体对象

- **位置**：[rest.ts:143](/Users/jimmy/Documents/aiao/rxdb_ai/packages/rxdb-adapter-http/src/rest.ts:143)、[rest.ts:302](/Users/jimmy/Documents/aiao/rxdb_ai/packages/rxdb-adapter-http/src/rest.ts:302)
- `isRecord()` 只判断 `typeof value === 'object'` 且非 `null`，没有排除数组；`assertRow()` 因而会接受 `[]` 或数组形式的响应。
- `onCreate` / `onUpdate` 随后把该值当作持久化行返回，非法回执可能进入 QueryCache 的本地 upsert 流程，造成与远端实际行形状不一致的缓存状态。
- 应明确要求“非数组的普通对象”，并补 create/update 的数组回执测试。

### P2：应在本 PR 修复

#### P2-1 非 2xx body 读取期间断开被错误归类为 `HttpResponseError`

- **位置**：[transport.ts:101](/Users/jimmy/Documents/aiao/rxdb_ai/packages/rxdb-adapter-http/src/transport.ts:101)、[RxDBAdapterHttp.ts:236](/Users/jimmy/Documents/aiao/rxdb_ai/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:236)
- 非 2xx 分支用 `response.text().catch(() => undefined)` 吞掉了 body 读取期间的 `AbortError`。如果此时执行 `disconnect()`，最终仍会构造 `HttpResponseError`，而不是契约要求的 `HttpDisconnectedError`。
- 这会使调用方无法区分“服务端返回错误”与“调用方主动取消”，并可能破坏断开请求的错误处理路径。

#### P2-2 offset 分页推进不符合 US-212 规范

- **位置**：[pagination.ts:126](/Users/jimmy/Documents/aiao/rxdb_ai/packages/rxdb-adapter-http/src/pagination.ts:126)、[pagination.spec.ts:69](/Users/jimmy/Documents/aiao/rxdb_ai/packages/rxdb-adapter-http/src/pagination.spec.ts:69)
- 当前实现使用 `offset += parsed.rows.length`；故事规范要求数组形态固定使用 `offset += limit`：[US-212-http-adapter.md:221](/Users/jimmy/Documents/aiao/rxdb_ai/requirements/stories/adapter/US-212-http-adapter.md:221)。
- 当服务端返回的行数与请求的 `limit` 不一致时，当前实现会改变下一页起点，可能跳过数据；现有测试反而冻结了错误行为，需要同步修改实现和断言。

#### P2-3 `nextPageToken` 缺少运行时类型校验

- **位置**：[pagination.ts:55](/Users/jimmy/Documents/aiao/rxdb_ai/packages/rxdb-adapter-http/src/pagination.ts:55)
- `normalizePage()` 通过 TypeScript 类型断言读取 `nextPageToken`，没有确认它是 `string` 或 `undefined`。
- `null`、数字等非法 token 会进入下一页请求；与合法 token 的相等判断和 handler 请求参数也会因此产生未定义行为。应在边界处抛 `HttpHandlerContractError`。

#### P2-4 auth header 大小写变体会破坏覆盖优先级

- **位置**：[transport.ts:302](/Users/jimmy/Documents/aiao/rxdb_ai/packages/rxdb-adapter-http/src/transport.ts:302)
- `Object.assign()` 按大小写敏感的对象键合并 header。若静态配置含 `Authorization`、auth hook 返回 `authorization`（或反过来），两个键会同时传给 `Headers`，结果可能变成合并值（如 `old, new`），而不是 auth hook 覆盖旧值。
- 这违反“auth hook 优先级最高”的契约，可能发出错误凭据。应使用大小写不敏感的合并策略，并补大小写变体测试。

#### P2-5 重复 `connect()` 不会取消旧 transport 请求

- **位置**：[RxDBAdapterHttp.ts:154](/Users/jimmy/Documents/aiao/rxdb_ai/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:154)
- `connect()` 直接替换 `#disconnected` 和 `#transport`，没有先 abort 旧的 `AbortController`。
- 旧请求仍绑定旧 signal，之后的 `disconnect()` 只会取消新一代请求；旧请求只能等自身超时，形成无法主动收口的孤儿请求。重复 `connect()` 应等价于先断开旧连接，或显式拒绝重复连接。

#### P2-6 断开后未配置 `onVersion` 时错误优先级错误

- **位置**：[RxDBAdapterHttp.ts:190](/Users/jimmy/Documents/aiao/rxdb_ai/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:190)
- `version()` 先检查 handler 是否存在，再调用 `#assertConnected()`。因此适配器已断开且未配置 `onVersion` 时，抛出的是 `HttpUnsupportedOperationError`，而不是连接生命周期契约要求的 `HttpDisconnectedError`。
- 应先统一检查连接状态，再判定可选 handler 是否配置，保证断开状态优先。

### P3：低危，但应跟踪

#### P3-1 新 HTTP 包未加入 `tsconfig.base.json` paths

- **位置**：[tsconfig.base.json:23](/Users/jimmy/Documents/aiao/rxdb_ai/tsconfig.base.json:23)
- `paths` 没有 `@aiao/rxdb-adapter-http` 及其公开子路径。当前分支尚无跨包 source import，因此尚未暴露；第一个包内 source import 到来时，TypeScript 可能回退解析到 `node_modules` / `dist`，引发类型与 API surface 解析不一致。
- 应按仓库现有包补齐 source path，并增加对应 typecheck 覆盖。

#### P3-2 subpath 审计允许 `@aiao/source` 路径逃逸包目录

- **位置**：[subpath-inventory.mjs:82](/Users/jimmy/Documents/aiao/rxdb_ai/scripts/audit/subpath-inventory.mjs:82)
- 审计脚本把 source 条件直接与 `packageDir` 拼接，只检查目标文件存在，没有验证规范化后的路径仍位于当前包目录内。
- `../../其他包/src/index.ts` 这类路径可因此通过审计，导致一个包的导出表扫描到别的包源文件。应增加目录 containment 校验。

#### P3-3 website REST 文档仍写着已删除的 `isTableExisted` 默认路径

- **位置**：[website/docs/adapters/http.md:129](/Users/jimmy/Documents/aiao/rxdb_ai/website/docs/adapters/http.md:129)、[rest.ts:118](/Users/jimmy/Documents/aiao/rxdb_ai/packages/rxdb-adapter-http/src/rest.ts:118)
- 网站表格仍写 `isTableExisted` 默认路径为 `:entity`；实现已取消默认 path，未显式配置时不会产出该 handler，而是复用 metadata 探测。
- 接入方照文档配置会误以为默认 HEAD 端点已启用。应把网站文档改为 `—`，并明确“需显式配置 path”。

## 3. 已验证项目

| 验证项 | 结果 |
| :--- | :--- |
| `pnpm nx test rxdb-adapter-http --outputStyle=static` | ✅ 9 个 spec，274/274 通过；statements 99.59%，lines 99.78% |
| `pnpm nx typecheck rxdb-adapter-http --outputStyle=static` | ✅ 通过 |
| `node scripts/audit/subpath-inventory.spec.mjs` | ✅ 15/15 通过 |
| `node scripts/audit/api-surface.mjs --check` | ✅ 30 个包、44 个入口通过 |
| `git diff --check` | ✅ 通过 |

Nx Cloud 远程缓存连接曾返回 401，但本地任务已成功完成；这不影响上述结果。其他全量集成验证仍受本机 `::1` 监听权限或 Docker socket 权限限制，未将环境失败误记为业务回归。

## 4. 总体结论

**当前不建议直接合入。** 至少先修复 P1-1、P1-2，以及 P2-1、P2-2、P2-5、P2-6；它们分别影响 wire 数据完整性、缓存一致性、错误语义、分页正确性和请求生命周期。P2-3/P2-4 与 P3 项可并行处理，但不应长期留在公共适配器契约中。

旧报告中的“响应体完全没有超时保护”、条件请求适配器接线缺测试、Supabase retry 分类缺测试和 REST 源码 TSDoc 表错误，已被当前实现或测试修复，不再作为本次分支的有效 finding。
