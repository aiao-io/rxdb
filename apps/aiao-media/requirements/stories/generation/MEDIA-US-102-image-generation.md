---
id: MEDIA-US-102
legacyId: aiao-media:US-102
product: aiao-media
title: 图片生成与本机交付
status: Blocked
priority: High
epic: MEDIA-EPIC-002
created: 2026-09-26
updated: 2026-10-25
dependsOn: [MEDIA-US-105, MEDIA-US-202, MEDIA-US-301]
tags: [image, provider, text-to-image, local-first]
---

# 用户故事：图片生成与本机交付

## 作为/我想要/以便

**作为** 图片创作者

**我想要** 套用灵感或填写提示词，用本机配置的供应商生成一张图片

**以便** 预览、保存到当前浏览器并下载，不必先注册账号

## 范围边界

### In Scope

- `/create` 复用 Tiptap 输入和本机草稿，提供正方形、横向、纵向三种画幅。提交前用 `serializePrompt()` 展开模板参数并校验；最终纯文本非空且不超过 2000 个 JavaScript `string.length` 单位，不静默截断，不发送编辑器 JSON、HTML 或字段标签。
- Images API 使用用户所选供应商的 `/images/generations`、配置模型、`n=1`、`quality=low`、`output_format=png`；MiniMax 官方前缀使用 `/image_generation`、`image-01`、`n=1`、`response_format=url`、关闭提示词优化。三画幅请求尺寸分别为 1024×1024、1536×1024、1024×1536，MiniMax 使用 `width/height`。兼容范围限已验证的供应商协议和参数组合。
- 默认使用本机配置的通道。浏览器直连和用户主动选择的本站代理分别展示数据去向；直连失败不自动切代理。生成仅由用户点击触发，模板套用、草稿恢复和重连均不调用模型。
- 请求前先持久化本地任务 ID、提示词/参数快照、供应商/模型标识和发送状态，快照不含 Key。Web Locks 与本地任务记录防止双击、多标签页和刷新产生重复请求。
- 区分生成中、明确拒绝、结果待核查、已生成但未保存、已保存。超时、断网、CORS、5xx、无效回执或页面中断不自动重发；重开页面后仍保留不确定状态。用户核对供应商用量与结果并明确确认后才能解除锁定，下一次生成可能再次计费。
- 支持 `b64_json` 或浏览器可跨域读取的 HTTPS 图片 URL。下载结果 URL 不携带供应商 Key；验证 PNG/JPEG 原始字节、实际尺寸和可解码性，原图不转码，MIME 与下载后缀匹配真实格式，作品记录真实输出尺寸，不用请求尺寸冒充实际输出。
- 先显示真实结果，再按文件写入、元数据关联和回读结果标记“已保存到本机”。保存失败保留可下载结果与重试保存入口，重试不再次生成；文件和作品管理见 MEDIA-US-202。
- 全站及结果旁提供反馈入口；当前支持复制反馈内容，不把复制成功显示为反馈已提交。

### Out of Scope

- 参考图上传、图生图、局部编辑、批量/多图生成、自动故障转移与异步供应商任务适配器。
- 服务端持久任务、试用日额度、平台代付、人工对账后台、关闭页面后继续生成或跨浏览器恰好一次计费保证。
- 离线调用远程模型；将模板示例图当作真实生成结果。
- 移动设备/移动系统输入法验收；当前优先桌面能力。

## 验收标准

| #   | 前置条件                               | 操作                         | 预期结果                                                            | 状态 |
| --- | -------------------------------------- | ---------------------------- | ------------------------------------------------------------------- | ---- |
| 1   | 本机配置和草稿已就绪，供应商为 fixture | 分别选择三种画幅生成         | 每次只发一个请求，模型/尺寸/单张参数正确，PNG/JPEG 原图可保存与下载 | ✅   |
| 2   | 未填必填参数或最终提示词超长           | 尝试提交                     | 保留输入并阻止调用；发送的有效提示词只含展开后的纯文本              | ✅   |
| 3   | 供应商返回图片                         | 保存后刷新作品页             | RxDB 元数据与 OPFS 原图可回读，实际输出信息可追溯                   | ✅   |
| 4   | 请求断网或结果不确定                   | 刷新页面并再次尝试           | 保留待核查状态，无自动重发或切换代理                                | ✅   |
| 5   | 两个标签页或连续点击生成               | 同时提交                     | 同一工作区只产生一次在途生成请求                                    | ✅   |
| 6   | OPFS 写入失败                          | 下载结果，恢复存储后重试保存 | 不虚报已保存；下载仍可用，重试不再次调用模型                        | ✅   |
| 7   | 至少一种真实供应商、正式 HTTPS origin  | 分通道验证三种画幅           | 真实结果能保存、回读和下载，直连与代理分别记录证据                  | ⚠️   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过。

## 技术笔记

2026-10-25 最新验收：PNG/JPEG 原图交付已随正式版本 `e6ece57b-cd1f-4834-99cb-f20813817eb2` 发布，本地完整测试 700/700、页面 E2E 32/32 与公网烟测通过。22:04:17 的 MiniMax direct/square 请求返回 HTTP 200 / 业务码 0，但浏览器未取得可读原图响应，保存、刷新回读和精确下载未通过正式验收；横/竖两幅未发送，自动重试 0。AC7 继续 ⚠️，故事保持 Blocked；按供应商请求 ID 取回同一结果后只读复核，后续历史 1033 记录保留。详见[JPEG 交付验收](../../plans/jpeg-delivery-verification.md)。

本地闭环已交付。`aiao-media-e2e:local-first-e2e` 使用真实 Chrome、RxDB、WASM、IndexedDB 和 OPFS，供应商为 fixture；它验证状态与保存行为，不证明真实供应商在正式 origin 可用。

2026-10-25 正式 `https://media.aiao.io` 的真实供应商代理三画幅均通过：每项一次请求、HTTP 200、PNG 尺寸精确匹配，保存、刷新回读与下载字节/SHA-256 一致。直连正方形一次尝试未收到响应，保持 `requires-review`，未重发；另两种直连画幅未尝试。AC7 的代理部分已验，直连部分未完成，整项保持 ⚠️；不为补验重发未知请求。三项结果均为 base64，不提供 URL 原图读取证明。发布身份、摘要和证据边界见[正式交付验收](../../plans/public-delivery-verification.md)。故事因当前供应商能力与缺失单次请求核对证据记为 `Blocked`，PR 尚未合并。

当前任务沿用 `processing`、`completed`、`failed`、`needs_review` 等契约状态，保存标记与生成状态分开。页面中断后不假设请求未发送，也不假设供应商可查询或撤销原请求。

2026-10-25 补验复核：当前供应商的正式 origin 预检仍为 403，既有成功结果为 base64；用量 API 只有汇总、没有单次请求记录，原正方形请求保持未知。缺少可用直连/URL 组合，状态记为 Blocked；本轮新增生成请求为 0。具体关闭条件见[供应商补验记录](../../plans/provider-acceptance-follow-up.md)。

## 实现文件

- [本地创作入口](../../../src/app/local-image-mvp.ts)及[界面](../../../src/app/local-image-mvp.html)
- [浏览器供应商适配器](../../../src/app/local-provider.ts)
- [提示词序列化与校验](../../../src/app/prompts/prompt-state.ts)
- [本地文件与作品存储](../../../src/local-data/browser-media.ts)
- [真实应用浏览器测试](../../../../aiao-media-e2e/src/local-first.spec.ts)

## References

- [MEDIA-US-105 图片供应商配置与适配器](MEDIA-US-105-provider-management.md)
- [MEDIA-US-106 图片提示词灵感库与一键套用](MEDIA-US-106-prompt-gallery.md)
- [MEDIA-US-202 本地图片作品与任务历史](../account/MEDIA-US-202-library.md)
- [MEDIA-US-301 浏览器本地草稿与图片持久化](../local-first/MEDIA-US-301-browser-persistence.md)
- [真实应用集成验证](../../plans/local-first-app-verification.md)
