---
id: MEDIA-US-105
legacyId: aiao-media:US-105
product: aiao-media
title: 图片供应商配置与适配器
status: Blocked
priority: High
epic: MEDIA-EPIC-002
created: 2026-09-26
updated: 2026-10-29
dependsOn: [MEDIA-US-301]
tags: [image, providers, local-first, security]
---

# 用户故事：图片供应商配置与适配器

## 作为/我想要/以便

**作为** 图片创作者

**我想要** 在本机配置图片供应商、模型、API Key 与请求通道

**以便** 使用自己的供应商额度出图，并清楚知道凭据与提示词会发送到哪里

## 范围边界

### In Scope

- `/providers` 支持本机配置新增、编辑、删除和默认选择。字段包括稳定 UUID、名称、HTTPS Base URL、模型 ID、直连/代理通道及是否记住 Key；首次启动可建立随应用发布的默认配置，未填写 Key 时引导填写并保留原草稿。
- Base URL 可以包含 API 版本路径，不含内嵌凭据、query 或 fragment；模型 ID 限 1–128 位英数字、点、下划线、冒号或短横线。配置作为数据使用，不执行脚本或自定义代码。
- 自建配置默认浏览器直连；预设配置按其声明的通道显示。用户主动选择代理时，明确说明本站 Worker 会处理本次 Key、提示词和结果；两种通道均以本地保存配置、任务和作品为基础，不以账号或 Supabase 为前置条件。
- Key 默认仅在当前页面内存。用户明确勾选“在此设备记住 Key”后，才按 providerId 写入独立本机凭据记录；支持替换和移除。供应商配置、草稿、任务/作品快照、备份、构建产物、日志和错误信息均不包含 Key。
- 如实说明本机凭据的存储边界，不以随应用下发的固定密钥宣称安全加密。本站代理按请求使用 Key，无数据库、持久凭据、结果缓存或敏感日志；代理目标、同源和路径限制由 MEDIA-US-004 验收。
- 适配器固定请求映射、响应大小限制、PNG/JPEG 原图签名与解码校验和错误分类；下载结果 URL 不转发鉴权头、Cookie 或 Referer，不跟随未知重定向。鉴权错误、限流、明确拒绝和不确定结果分别处理。
- 直连需要供应商 API 和结果图片均允许浏览器读取。localhost、预览域名和正式域名分别留证；可显示远程图片或可读模型列表不等于可生成、保存和下载。不支持的组合给出说明，不自动使用代理或公共 CORS 绕过服务。
- 非敏感配置的多机同步属于 MEDIA-US-302；首阶段固定排除 Key；后续凭据同步需另行定义范围与安全策略。

### Out of Scope

- 工作区管理员代管密钥、服务端供应商管理与证据机、平台充值/计费、自动择优或故障转移。
- 任意供应商插件市场；未经适配与验证便承诺全部图片 API、模型或参考图语义可用。
- 长期云端托管 Key。

## 验收标准

| #   | 前置条件                        | 操作                          | 预期结果                                                  | 状态 |
| --- | ------------------------------- | ----------------------------- | --------------------------------------------------------- | ---- |
| 1   | 无登录的本机工作区              | 保存并选择供应商后刷新        | 非敏感配置与默认选择可恢复，未填 Key 时引导填写而不丢草稿 | ✅   |
| 2   | 未勾选记住 Key                  | 生成后刷新页面                | Key 不恢复；不进入任务和备份                              | ✅   |
| 3   | 用户选择记住 Key                | 保存、替换或移除凭据          | 仅独立凭据记录持有 Key，其他记录和备份不含凭据            | ✅   |
| 4   | 用户主动选择代理                | 生成图片                      | 仅此通道向同源代理发送本次凭据；直连失败不自动切换        | ✅   |
| 5   | 非法 URL、模型或无效响应        | 保存配置或调用适配器          | 明确拒绝且不泄露凭据；不生成假作品                        | ✅   |
| 6   | 至少一种真实供应商与正式 origin | 验证 API 预检、图片获取和下载 | 分别记录直连/代理可用组合、参数和限制                     | ✅   |
| 7   | 结果位于其他 HTTPS origin       | 读取并下载图片                | 图片请求不携带供应商 Key，不以 img 可显示代替可读取验证   | ⚠️   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过。

## 技术笔记

配置与凭据通过本机 `LocalPreference` 分开保存，凭据记录为 `provider-keys-v1`。`aiao-media-e2e:local-first-e2e` 验证本机配置恢复、内存 Key、记住/替换/单独移除、主动代理、非法 URL/模型和损坏 PNG 拒绝、无 Key 备份，以及 fixture 跨 origin 图片读取不带凭据与精确下载；`aiao-media:relay-test` 验证代理边界。[本地可靠性验收](../../plans/local-reliability-verification.md)记录故障边界。

MiniMax `image-01` 原生适配由浏览器、Worker 与正式验收共用[请求协议映射](../../../src/contracts/image-provider-protocol.ts)：只识别三个官方 API 前缀，固定单张、`response_format=url`、关闭提示词优化，三画幅用 `width/height` 精确请求；1002/1004/1008/1026/2013/2049 按明确拒绝处理，1033、超时与未知码保持不确定。范围与 12 个 fixture 组合见[供应商补验](../../plans/provider-acceptance-follow-up.md#minimax-原生适配与本地验证2026-10-25)。

AC6 已由正式 origin 证据关闭：带 Key 模型目录 GET 200 且配置模型存在；无 Key OPTIONS 403；显式代理三画幅各一次 HTTP 200，保存、刷新回读与精确下载通过。可用范围限定该供应商/模型的代理参数组合，见[正式交付验收](../../plans/public-delivery-verification.md)。

AC7 仍缺真实证据：产品内成功结果均为 base64；MiniMax 正方形直连返回了 URL，但浏览器未取得可读原图，原因尚未定位，URL 已失效。MiniMax 图片域名能否被浏览器跨域读取由直连横图诊断确认；若不能，需另选结果 host 允许浏览器读取的供应商。故事因缺少可用的 URL 组合记为 `Blocked`。

## 实现文件

- [本机配置与凭据生命周期](../../../src/app/local-image-mvp.ts)
- [浏览器供应商适配器](../../../src/app/local-provider.ts)
- [无 Key 备份](../../../src/app/local-backup.ts)
- [本地数据存储](../../../src/local-data/browser-media.ts)
- [无状态代理](../../../server/cloudflare/local-first-worker.mjs)
- [真实应用浏览器测试](../../../../aiao-media-e2e/src/local-first.spec.ts)

## References

- [MEDIA-US-102 图片生成与本机交付](MEDIA-US-102-image-generation.md)
- [MEDIA-US-004 Cloudflare 静态部署与可选代理](../platform/MEDIA-US-004-cloudflare-edge-deployment.md)
- [MEDIA-US-302 多端草稿同步与冲突处理](../local-first/MEDIA-US-302-draft-sync.md)
- [历史直连试验记录](../../plans/local-first-direct-probe-verification.md)
- [验收记录](../../verification-report.md)
