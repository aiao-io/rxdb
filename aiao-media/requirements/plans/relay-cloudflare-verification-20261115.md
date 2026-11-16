# 2026-11-15 Cloudflare 任务重置与加密容量实测

本记录服务 [MEDIA-US-109](../stories/generation/MEDIA-US-109-relay-durable-task.md)。生产双区域的真实模型与积分证据见[双区域验收](requirements-completion-20261114.md#双区域真实积分与三画幅验收)。本轮使用同一 Cloudflare 账号的独立临时 Worker、真实 SQLite Durable Object 和私有 R2；未修改正式 Worker，没有调用生图供应商。

## 真实实例重置

临时生命周期 Worker 直接导入未修改的 `apps/api/src/relay-task.ts`，SHA-256 为 `2b23b17d22dfb73ddb452064cf024036c89672eb81118a1cf29ac83f541e66fa`。只通过既有构造参数注入 fixture 上游和积分回执，任务状态、SQLite、加解密、R2、210 秒看门狗、24 小时有效期与 alarm 均运行产品实现。测试包装器调用真实 `ctx.abort()`，并记录实例重建及 alarm 前后状态；没有调整时间或调用替身的 reset。

| 场景                                    | 真实运行结果                                                                                          | 结果核对                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 上游仍在等待时中止实例                  | 新实例读取原任务；210.739 秒后真实 alarm 将 `dispatched` 改为 `needs_review`，积分状态转为 `released` | 上游计数始终为 1，没有结果对象；清理后任务查询 404                         |
| R2 写入成功、任务状态尚未落盘时中止实例 | 新实例保留 `dispatched` 行，真实对象仍在；210.245 秒后真实 alarm 恢复为 `received`                    | 上游计数始终为 1；取回后用原令牌解密，确认后删除；对象不存在且任务查询 404 |

第一次验收脚本把中止响应预期为 202，实际运行时返回 500；随后仅续验原任务，没有重发上游。另一个诊断用 KV 标记随 `ctx.abort()` 回滚，因此改用实际 R2 对象、重建实例、原任务行和真实 alarm 记录作为证据。两份失败回执保留；没有为验收修改产品代码或放宽产品状态断言。

MEDIA-US-109 AC6 转为通过，累计 9/12；故事保持 In Progress。上游错误、超时与断连的既有证据继续保留。

## 4 MiB 与 24 MiB 加密 CPU

临时容量 Worker 直接使用产品 `relayResultKey()` 与 `sealRelayResult()`，每次在独立 SQLite DO 中生成指定大小字节，派生密钥、AES-GCM 加密并写入真实 R2。客户端取回后使用产品 `openRelayResult()` 核对全部字节，随后删除对象并实测 404。

现有凭据调用 Workers Observability REST API 返回 403；同一凭据可读取官方 GraphQL 的 `durableObjectsInvocationsAdaptiveGroups` 与 `durableObjectsPeriodicGroups`。以下 CPU 为 Cloudflare 返回的微秒值除以 1000，分别与同对象的两类指标交叉核对；每个对象只有一次 HTTP invocation，`requests=1`、`errors=0`、`status=success`。

| 原文大小 | CPU 样本 1 | CPU 样本 2 | CPU 样本 3 | 中位数    |
| -------- | ---------- | ---------- | ---------- | --------- |
| 4 MiB    | 8.225 ms   | 17.915 ms  | 8.375 ms   | 8.375 ms  |
| 24 MiB   | 56.337 ms  | 57.623 ms  | 50.135 ms  | 56.337 ms |

六次均完成原字节解密，密文长度均为原文加 28 字节，CPU/内存超限计数均为 0；运行位置为 LHR 和 AMS。这是当前账号默认 DO 配置下的加密与 R2 写入容量证据，不将墙钟时间记作 CPU，也不将六个单次调用当作大样本 P99 或整个生图链路的压力结论。阶段 A 的 4/24 MiB 加密 CPU 缺证项关闭。

`workers.dev` 首次连接超时，改用独立临时子域名后完成六次实测。清理覆盖六份已完成对象和首次连接失败的待核对 key，共七个 key 均不存在；容量 Worker 与其自定义域名已删除，正式生产 deployment 前后相同。

## 完整 24 小时验收

独立生命周期 Worker 另接单一条 fixture 任务，完成后保持无人取回。原任务创建时间为北京时间 **2026-11-15 08:04:32.684**，真实 alarm 为 **2026-11-16 08:04:32.684**（UTC `2026-11-16T00:04:32.684Z`），差值精确为 86,400,000 ms。原对象存在，上游计数为 1；保留产品原有期限。

等待进程已启动，计划到期后 30 秒开始核对：先检查原任务行、R2 和真实 alarm 回执，再访问产品状态接口，避免把查询时的惰性过期当作 alarm 删除。全部通过后自动删除本轮生命周期 Worker 与临时域名，并再次核对正式 deployment 不变。只有最终回执写入 `expiryComplete: true` 才能关闭 AC9。

### 2026-11-16 期满终验结果

原等待进程在到期前退出，未执行核对。到期后按原回执重新运行同一核对脚本，只查询原任务，没有重发生成：

| 核对项 | 结果 |
| --- | --- |
| 真实 alarm | UTC `2026-11-16T00:04:32.988Z` 触发，晚于期限 304 ms；触发前任务行为 `received`，触发后为 0 行 |
| R2 对象 | 不存在；本轮三条任务的对象均已不存在 |
| 核对顺序 | 先读审计与对象，再读产品状态接口，排除查询时的惰性过期 |
| 产品接口 | 状态与结果均返回 404；上游计数仍为 1 |
| 临时资源 | 生命周期 Worker 与临时域名已删除，正式 `aiao-media` deployment 前后一致 |

回执写入 `expiryComplete: true`，MEDIA-US-109 AC9 转为通过，累计 10/12。浏览器端对期满 404 的处理（记为待核对、提示已过期、不重发）由任务客户端单测覆盖；1 天生命周期规则由 11-14 只读复核确认。

## 证据与剩余条件

原始回执位于 Git 忽略且权限受限的 `aiao-media/tmp/release-readiness-20261114/`：

- `relay-lifecycle-probe-results.json`：两种真实重置、真实 alarm、唯一上游计数、期限任务、期满证据与清理回执。
- `relay-lifecycle-expiry-resume.log`、`relay-lifecycle-probe-delete.log`：2026-11-16 续查与临时 Worker 删除输出。
- `relay-lifecycle-probe-attempt1.json`、`relay-lifecycle-probe-attempt2.json`：诊断失败记录。
- `relay-cpu-probe-custom-domain-results.json`：六次解密、对象清理与官方 CPU 原始数据。
- `relay-cpu-probe-cleanup.json`：七个 key、容量 Worker、自定义域名及正式 deployment 核对。

公开文档不包含任务令牌、探针访问凭据或会话。当前 MEDIA-US-109 仍待 AC10 的真实双标签页刷新与唯一保存/删除、AC11 的桌面安装版来源。Web/Tauri 原图双向同步、正式签名公证与公众注册邮件按各自故事继续验收。
