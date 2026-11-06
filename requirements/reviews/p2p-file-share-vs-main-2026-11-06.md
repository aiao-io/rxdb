# P2P 文件共享分支相对 main 的深度评审

- 评审日期：2026-11-06。
- 评审分支：`codex/p2p-file-share`。
- 评审快照：`b3bb3aa4c`。
- 对比基线：`main`，`c30de173f5ea77f25b11d0a08e47e5634b527562`。
- 差异范围：`git diff main...b3bb3aa4c`，270 个文件，新增 29,677 行、删除 131 行。
- 结论：🔴 不建议合入 main；剩余 12 项，包含 5 项 P1、7 项 P2。P2P-R03 是已被实现注释接受、但影响被低估的安全设计风险。

本文记录上述提交快照的评审结论。写入文档时分支已推进到 `c65522f2c7463d91c3ad5c6d2bd620174db0eee2`，新增的工作树性能门禁与 CI 改动尚未复评，不属于本文已验证范围。

按本目录的整分支评审约定，本文不占用 `RV-*` 编号。条目修复并复验后删除；全部处理完成后删除本文，并在目录 README 留清理记录。

## 评审范围与判定依据

审阅范围覆盖 `packages/rxdb-plugin-p2p` 的清单发现、分块传输、回退、会话与传输适配，`apps/dev-rxdb-p2p` 的 Angular 产品接线、认证、设备、公钥与信封、Worker 路由和治理接口、SQL 权限与部署配置，相关 e2e 接线，以及 RxDB 核心启动指纹和实体生命周期改动。

优先报告可定位、可复现并影响行为的问题。源码链接使用符号名定位，避免依赖会随代码变动漂移的行号。临时回归只用于评审取证，未纳入提交；修复时需将对应场景加入正式测试套件。

## 待处理问题

### P2P-R01 [P1] 同步清单可以把下载用户的 access token 发往外站

**证据锚点：** [`P2PWorkspace.#serverFallback.download`](../../apps/dev-rxdb-p2p/src/app/p2p/p2p-workspace.service.ts)、[`isP2PManifestRecord`](../../packages/rxdb-plugin-p2p/src/manifest.ts)。

```ts
const url = manifest.sourceUrl ?? fileUrl(manifest.contentHash);
const headers: HeadersInit = { authorization: `Bearer ${token}` };
```

**问题与根因：** 下载采用同步清单中的 `sourceUrl`，并向该地址附加 bearer token；清单只校验 `sourceUrl` 是字符串。攻击者可以用自己的合法账号发布指向其 HTTPS 服务的清单，并让该服务返回允许 `authorization` 请求头的 CORS 响应。其他用户点击下载时，凭据会发送到攻击者控制的服务。

**复验：** 临时回归 `rejects an external fallback URL before sending the user token` 向清单注入 `https://attacker.invalid/collect`，调用实际 workspace 下载流程；fetch 调用记录包含该外部 URL 和 `Bearer access-token`。这是应用接线回归，fetch 被替换为测试桩，未向真实外站发请求。

**修复方向：** 在附加凭据前解析并校验地址，只允许当前源和受支持的文件下载路径；保留明文与密文回退的版本兼容路径。正式回归应同时覆盖外部源、协议相对 URL 和合法同源地址。

### P2P-R02 [P1] 同一内容重复上传会覆盖旧密文副本的解密密钥

**证据锚点：** [`P2PWorkspace.#uploadEncrypted`、`P2PWorkspace.#decryptFallbackStream`](../../apps/dev-rxdb-p2p/src/app/p2p/p2p-workspace.service.ts)、[`writeEnvelopes`、`envelopeFor`](../../apps/dev-rxdb-p2p/src/app/device/fallback-envelopes.ts)、[`idx_p2p_envelope_content_recipient`](../../apps/dev-rxdb-p2p/supabase/p2p-schema.sql)。

**问题与根因：** 每次上传都会随机生成内容密钥、IV 和新的密文对象，但信封只按 `contentHash + recipientDeviceId` 覆盖。第二次上传把 K1 信封覆盖为 K2 信封；旧清单仍可能引用使用 K1 加密的副本 C1。下载 C1 却取到 K2，解密失败。

**复验：** 临时回归 `keeps the published encrypted copy decryptable after sharing identical bytes twice` 使用真实 WebCrypto，连续两次共享相同的四字节内容，记录到两个不同密文对象；按已发布清单下载时，传输状态为 `failed`。

**修复方向：** 信封绑定密文对象或副本版本，例如增加 `encHash`，写入和读取使用同一身份；或者明确复用同一副本的内容密钥。只更新当前 holder 的清单不能解决其他 holder 仍引用 C1 的问题。

### P2P-R03 [P1／安全设计] 任意登录账号可覆盖或删除全部设备的密钥信封

**证据锚点：** [`envelope_update`、`envelope_delete` 及信封表 GRANT](../../apps/dev-rxdb-p2p/supabase/p2p-schema.sql)。

```sql
FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
FOR DELETE TO authenticated USING (true);
```

**问题与根因：** 任意认证账号都能通过直连 PostgREST 覆盖或清空信封表。实现注释将删除视为可用性降级，但当只剩服务器副本、上传时的内容密钥已释放时，删除全部信封会让这些 R2 密文永久失去可解密性。AEAD 能发现篡改，不能恢复被删掉的密钥。

**复验：** 临时回归 `refuses deleting a different user device envelope` 加载实际 schema，在真实 PGlite 中切换为另一账号的 `authenticated` 角色，成功删除了属于其他设备的信封。

**修复方向：** 为信封增加发布者或副本归属，并限制 UPDATE、DELETE 权限；保留合法的跨设备封装能力。为 upsert 放开 SELECT 不要求同时赋予任意账号全表更新和删除权限。本项涉及修改现有安全取舍，需同步更新加密故事中的权限说明。

### P2P-R04 [P1] 一条畸形设备公钥可以阻断整个部署的加密上传

**证据锚点：** [`devices_update`、`team_device_keys()`](../../apps/dev-rxdb-p2p/supabase/p2p-schema.sql)、[`P2PWorkspace.#sealEnvelopes`](../../apps/dev-rxdb-p2p/src/app/p2p/p2p-workspace.service.ts)。

**问题与根因：** 用户能将本人设备的 `public_key` 更新为任意字符串，`team_device_keys()` 返回全部非空公钥。上传方对每个公钥调用 `sealContentKey`；任意一次公钥导入失败都会中止整个分享。失败发生在密文已写入 R2 之后，还会留下未发布对象。

**复验：** 临时回归 `does not let a single malformed team key stop every encrypted share` 使用一个有效公钥和一个 `not-a-valid-spki`，调用实际分享流程和真实 WebCrypto，得到 `DataError: Invalid keyData`。

**修复方向：** 公钥登记边界校验 SPKI、P-256 与长度，避免任意字符串进入可信公钥集合；同时定义已有损坏设备记录的处置方式，不能让一个损坏设备成为所有用户上传的故障点。

### P2P-R05 [P1] 启动指纹将历史成功误当成当前物理 schema 有效

**证据锚点：** [`RxDB` 的 `bootstrapComplete` 分支、`#ensureEntityTables`](../../packages/rxdb/src/RxDB.ts)、[`readBootstrapFingerprints`](../../packages/rxdb/src/system/bootstrap-fingerprint.ts)、[`assertNoEntityConstraintDrift`](../../packages/rxdb/src/system/constraint-drift.ts)。约束契约见 [US-030 的 AC10／AC11](../stories/core/US-030-declarative-storage-constraints.md)。

**问题与根因：** 指纹由实体声明和迁移名计算，不是对当前物理 schema 的校验；旧指纹永久保留，命中任意历史指纹就跳过约束漂移检查。数据库经历 A 版本、B 版本迁移、A 版本重开时，历史 A 指纹仍可命中，旧客户端在不符合其声明的结构上连接成功。此路径也跳过业务表存在性检查和补建，缺失业务表时连接仍成功，查询时才报缺表。

**复验：** 新增两条核心回归，第一次完整连接后断开，再分别令业务表探测返回缺失、令物理约束检查报告 drift。重连均成功：业务表未补建，物理检查未调用。这里使用 mock adapter 验证启动调用链；A → B → A 是由历史指纹集合语义推导出的触发场景，未单独运行真实数据库版本切换实验。

**修复方向：** 保留每次连接必要的表存在性与物理约束检查，或引入能在所有 schema 变更路径可靠失效的代次。仅根据当前声明是否曾成功引导，不能证明物理结构仍满足声明。

### P2P-R06 [P2] 已有本地共享再上传服务器副本，副本地址不会发布

**证据锚点：** [`P2PWorkspace.share`、`P2PWorkspace.#claim`](../../apps/dev-rxdb-p2p/src/app/p2p/p2p-workspace.service.ts)。

```ts
if (!this.#entities.has(record.id)) {
  await Object.assign(new P2PFileManifestEntity(), toRxDBManifestDocument(record)).save();
}
```

**问题与根因：** 先执行 `share(file, false)`，再执行 `share(file, true)`，后一次会成功上传，但 `#claim` 因同一 holder 的记录已存在而跳过保存，`sourceUrl` 仍为空。其他用户看不到可用回退副本，R2 留下孤儿对象。

**复验：** 临时回归 `publishes the server URL when an existing local share is uploaded later` 依次执行上述两个操作，得到的清单 `sourceUrl` 为 `undefined`。

**修复方向：** 对已有持有声明更新新增的服务器副本地址，并保留仍然有效的已有字段。即使 P2P-R02 采用稳定密钥，本项仍需单独修复。

### P2P-R07 [P2] 副本可用性标识与实际下载清单来自不同 holder

**证据锚点：** [`groupSharedFiles`](../../apps/dev-rxdb-p2p/src/app/db/manifest-records.ts)、[`P2PWorkspace.download`、`P2PWorkspace.#serverFallback`](../../apps/dev-rxdb-p2p/src/app/p2p/p2p-workspace.service.ts)。

```ts
manifest: holders[0] as P2PManifestRecord,
```

**问题与根因：** `manifest` 固定取最新 holder，`serverCopy` 却检查全部 holder。较早 holder 有密文副本、较新 holder 只有 P2P 声明时，界面显示可以回退，下载却使用没有 `sourceUrl` 的最新清单，拼出明文 `/api/files/<contentHash>`，忽略已有密文地址。

**复验：** 临时回归 `uses a holder with a server URL when the newest holder has none` 构造上述两条第三方持有声明，无在线来源时触发下载；实际请求了明文地址。

**修复方向：** 服务器回退显式选择带有效副本地址的清单，并同时采用其对应分块信息，不能只把其他 holder 的 URL 拼接到当前清单上。

### P2P-R08 [P2] 界面举报密文文件后，管理员删除副本实际删不到对象

**证据锚点：** [`FilesPanel.submitReport`](../../apps/dev-rxdb-p2p/src/app/pages/files-panel.ts)、[`resolveReport`](../../apps/dev-rxdb-p2p/server/admin.ts)、[治理 e2e](../../apps/dev-rxdb-p2p-e2e/src/demo/governance.spec.ts)。

```ts
await this.workspace.report({ contentHash: file.contentHash }, category);
```

**问题与根因：** 产品入口只提交明文 `contentHash`，后台只有收到 `sourceUrl` 才能定位密文对象。因此管理员处置会删除不存在的明文键，再正常归档举报；真正的密文副本仍可下载。

**复验：** 临时 UI 回归 `review regression: sends the encrypted copy URL through the visible report action` 确认实际调用遗漏 `sourceUrl`。后端错误删除路径由 `resolveReport` 源码确认。现有治理 e2e 通过直接 API 手工提交 `sourceUrl`，未覆盖该界面入口。

**修复方向：** 前端提交正确的副本目标，后台校验其与举报对象的映射，保证成功处置对应真实对象。正式回归需经产品举报入口走完整处置流程。

### P2P-R09 [P2] 下载取消或异常结束时不记已发送流量

**证据锚点：** [`download` 的 `TransformStream.flush`](../../apps/dev-rxdb-p2p/server/files.ts)、[`DEFAULT_POLICIES`](../../apps/dev-rxdb-p2p/server/limiter.ts)。

```ts
flush() {
  countBytes(total);
}
```

**问题与根因：** 流量仅在流正常结束时记账。客户端在 EOF 前主动取消，或源流异常结束，已发送字节不会计入每日额度。下载次数限制仍然存在，本项不是无限下载漏洞，但每日 1 GiB 的字节配额可以被显著突破。

**复验：** 临时回归 `charges bytes already sent when a download is cancelled` 经过实际文件路由读取 32 字节后取消响应，`reportBytes` 调用次数为零。

**修复方向：** 流中分批记账，或预留额度后结算，覆盖正常结束、取消和异常路径；并发请求也应遵守同一额度边界。

### P2P-R10 [P2] 邀请码激活重试不满足声明的幂等契约

**证据锚点：** [`p2p.activate_invite()`](../../apps/dev-rxdb-p2p/supabase/p2p-schema.sql)、[`InviteDirectory.activate`、`handleInviteRequest`](../../apps/dev-rxdb-p2p/server/invites.ts)。

```sql
SELECT COALESCE(
  EXISTS (SELECT 1 FROM claimed),
  EXISTS (SELECT 1 FROM p2p.activated_users AS au WHERE au.user_id = activate_invite.user_id)
)
```

**问题与根因：** 第一项 `EXISTS` 永远不是 NULL，`COALESCE` 不会读取第二项。同账号同码首次激活成功，重试返回 false，Worker 回 409。首次响应丢失后，用户重试会看到激活失败，页面无法靠该次重试恢复状态。

**复验：** 临时回归 `returns activated for an already activated user on an invite retry` 在真实 PGlite 中以 `service_role` 连续调用实际函数，结果分别为 true、false。

**修复方向：** 使用正确的布尔判断，并保证已激活账号不继续消耗其他有效邀请码。正式回归覆盖同码重试与已激活账号提交新码。

### P2P-R11 [P2] 解密流取消操作了已锁定的源流

**证据锚点：** [`readExact`、`decodeEncryptedStream`](../../apps/dev-rxdb-p2p/src/app/p2p/fallback-crypto.ts)、[`StreamChunker.cancel`](../../packages/rxdb-plugin-p2p/src/fallback.ts)。

```ts
cancel(reason) {
  return source.cancel(reason);
}
```

**问题与根因：** `readExact` 已通过 `source.getReader()` 锁住源流，再调用 `source.cancel()` 会抛出 `ReadableStream is locked`。上层吞掉取消错误，底层响应 reader 没有正确释放。显式 AbortSignal 可以另行终止 fetch，但不能覆盖全部解密和校验失败路径。

**复验：** 临时回归 `cancels the underlying encrypted response reader without rejecting` 使用真实 Streams，取消解密包装流后得到锁定错误，底层 cancel 未调用。

**修复方向：** 保留 reader，通过 `reader.cancel()` 取消，并处理解密异常时的 reader 清理；正式回归同时覆盖主动取消和解密失败。

### P2P-R12 [P2] 邀请制门禁 e2e 未接入已提交的执行目标

**证据锚点：** [产品 e2e 的 `testIgnore`](../../apps/dev-rxdb-p2p-e2e/playwright.demo.config.ts)、[`e2e-remote` 命令](../../apps/dev-rxdb-p2p-e2e/project.json)、[limits 配置的 `testMatch`](../../apps/dev-rxdb-p2p-e2e/playwright.demo.limits.chrome.mts)、[门禁套件](../../apps/dev-rxdb-p2p-e2e/src/demo/governance-gated.spec.ts)。

**问题与根因：** 普通产品配置排除了 `governance-gated.spec.ts`，`e2e-remote` 只运行普通配置和 limits 配置。注释引用的 `playwright.demo.gated.chrome.mts` 未提交，默认会话层 e2e 也只匹配 WebRTC 与 TLS 套件。因此现有 Nx／CI 目标不会执行这组生产门禁测试。

**复验：** 静态核对上述配置与项目目标，以及仓库内配置文件清单；本项没有运行门禁真栈测试。

**修复方向：** 提交独立 gated 配置，设置 `POOL_REQUIRE_ACTIVATION=true`，并串行接入 `e2e-remote`，确保普通、limits、gated 三组运行互不争抢服务。

## 验证结果与边界

| 检查 | 结果 | 证据范围 |
| --- | --- | --- |
| `rxdb-plugin-p2p:test` | 15 个文件、154 条通过 | 插件协议、传输与会话单元测试 |
| 插件覆盖率 | statements 97.39%、branches 93.96%、functions 96.93%、lines 99.89% | 高覆盖率未覆盖本文列出的全部跨层组合 |
| `dev-rxdb-p2p:test --maxWorkers=1` | 44 个文件、509 条全部通过 | 应用及 Worker 原有测试；默认并发首次遇到 PGlite 初始化超时，串行复跑通过 |
| 核心启动相关原有测试 | 4 个文件、41 条通过 | `RxDB.bootstrap-fingerprint`、`RxDB.plugin-entities`、`RxDB.migration-watermark`、`RxDB.connect-lifecycle` |
| `dev-rxdb-p2p-e2e:e2e` | 14 条通过 | 真实 WebRTC 与两个独立 Node 进程的 TLS 会话；不等同于产品完整真栈验收 |
| 三个相关项目的 lint、typecheck | 通过 | `rxdb`、`rxdb-plugin-p2p`、`dev-rxdb-p2p` |
| `dev-rxdb-p2p:build` | 生产构建通过 | Angular 产品编译与产物生成 |
| 临时应用回归 | 11 条触发现状 | 10 条支撑待处理问题；1 条按既定范围排除，见下节 |
| 临时核心回归 | 2 条触发现状 | 两条均支撑 P2P-R05 的启动行为回归 |

本次没有运行产品完整的 Supabase／Worker `e2e-remote`，也没有运行全仓 `pnpm test-all`。真实 PGlite 的角色／SQL 回归不等同于已跑真实 Supabase 的 PostgREST 全链路；workspace 回归中的认证、网络与持久化部分使用测试桩，真实加密实验使用 WebCrypto。

### 复跑命令

以下是对应目标的复跑方式，测试结果来自本次评审实际执行。运行时设置 `NX_NO_CLOUD=true`；部分复跑还隔离了 `NX_CACHE_DIRECTORY` 和 `NX_WORKSPACE_DATA_DIRECTORY`，避免与同工作区的并行任务争用缓存。

```bash
pnpm nx run rxdb-plugin-p2p:test
pnpm nx run dev-rxdb-p2p:test --maxWorkers=1 --skipRemoteCache --outputStyle=static
pnpm nx run rxdb:test --run RxDB.bootstrap-fingerprint RxDB.plugin-entities RxDB.migration-watermark RxDB.connect-lifecycle --coverage=false --excludeTaskDependencies --skipNxCache --skipRemoteCache --outputStyle=static
pnpm nx run dev-rxdb-p2p-e2e:e2e --excludeTaskDependencies --skipNxCache --skipRemoteCache --outputStyle=static
pnpm nx run-many -t lint typecheck -p rxdb,rxdb-plugin-p2p,dev-rxdb-p2p --parallel=1 --excludeTaskDependencies --skipNxCache --skipRemoteCache --skipSync --outputStyle=static
pnpm nx run dev-rxdb-p2p:build --excludeTaskDependencies --skipNxCache --skipRemoteCache --skipSync --outputStyle=static
```

`--excludeTaskDependencies` 的运行使用此前已生成的依赖产物，不代表依赖链已在该条命令内重建。临时回归运行如下；这些测试文件已移出工作区，新 checkout 不能直接靠这两条命令复现，需先将对应场景加入正式套件。

```bash
pnpm nx run dev-rxdb-p2p:test review- --maxWorkers=1 --excludeTaskDependencies --skipNxCache --skipRemoteCache --outputStyle=static
pnpm nx run rxdb:test --run review-regressions --coverage=false
```

### 本机临时证据

这些路径是本次评审机器的临时产物，不随仓库分发，不作为永久验收凭据：

- 归档回归源码：`/tmp/p2p-review-repros/`，共 5 个测试文件，已从工作区移除。
- 应用回归：`/tmp/p2p-review-repro-app-final.log`。
- 核心回归：`/tmp/p2p-review-repro-core.log`。
- 插件测试及覆盖率：`/tmp/p2p-review-tests.log`，该日志还包含应用首次并发运行结果。
- 应用单 worker 复跑：`/tmp/p2p-review-app-serial.log`。
- 核心原有测试：`/tmp/p2p-review-core-final.log`。
- WebRTC／TLS e2e：`/tmp/p2p-review-e2e.log`。
- lint／typecheck：`/tmp/p2p-review-static.log`。
- Angular 生产构建：`/tmp/p2p-review-build.log`。

## 已核对并排除的行为

- 未激活账号直连 Supabase 写本人清单：临时回归确认该行为存在，但 [POOL-US-102 的范围边界](../../apps/dev-rxdb-p2p/requirements/stories/ops/POOL-US-102-rate-limit-report-invite.md) 明确将数据库级清单门禁留给后续故事，因此未列为本次实现缺陷。
- 同部署已登录用户可读共享清单、信封的跨用户读取、无 STUN／TURN 的局域网范围：均按既定契约评审，不作为权限或连通性缺陷。
- 封禁或信令踢下线后已有 P2P 连接仍可工作：文档明确接受该边界，未报告为本次回归。
- 三框架对称：P2P 共享包是框架无关能力；应用 AGENTS 明确该产品采用 Angular，不要求再创建 React／Vue 应用。

## 修复复验要求

- 先补正式失败回归，再修实现；跨层问题需经实际产品入口验证，不能用绕过入口的 API 测试替代。
- P2P-R02 与 P2P-R06 分别覆盖副本密钥身份和已有清单更新；修复其中一项不代表另一项关闭。
- P2P-R03 的权限调整与加密模型变更，需要同步更新产品故事、schema 和合法跨设备封装测试。
- P2P-R05 属于公共核心行为，需覆盖原有连接、迁移、缺表补建、约束漂移，以及真实数据库的版本切换场景。
- 修复后运行相关 Nx 检查和产品完整真栈 e2e；合入前仍需完成仓库要求的 affected 门禁。
