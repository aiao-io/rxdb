# Local-first 最小静态直连试验记录

日期：2026-10-23（Asia/Shanghai）。本记录保留 LF-0 最小页面和本机浏览器实验的结论；完整 local-first 应用、可选代理与 Cloudflare 静态发布已有独立实现和验收记录。

## 结论

| 验证层次                                   | 结果                 | 能说明什么                                                     |
| ------------------------------------------ | -------------------- | -------------------------------------------------------------- |
| 纯静态页面 + 支持 CORS 的 HTTPS 测试供应商 | 通过                 | 浏览器能直接发起鉴权 POST、解码 PNG 并下载，不需要本站业务后端 |
| 当前真实网关 + 本机 origin                 | 受阻                 | OPTIONS 403，缺少跨域响应头，浏览器阻断生成 POST；没有取得图片 |
| Pages 正式 origin + 真实供应商             | 未测                 | 本次未创建/发布 Cloudflare 项目，不能用 localhost 结果代替     |
| 我们提供的可选代理                         | 已实现，另有独立测试 | 不把代理成功当作浏览器直连成功证据                             |

据此确认架构保留两条通道：允许浏览器直连的供应商由用户本机调用；需要代理的供应商由用户主动选择我们的代理。代理默认按请求使用 Key，不持久保存，应用数据仍以本地为准。

## 本次实现

- [验证页](../../direct-provider-probe/index.html)、[浏览器请求代码](../../direct-provider-probe/main.js)、[使用说明](../../direct-provider-probe/README.md)。
- [构建与静态预览脚本](../../scripts/direct-provider-probe.mjs)：只复制四个公开静态文件；预览服务不接受 POST、不提供 API、不暴露环境文件。
- [真实浏览器测试](../../scripts/direct-provider-probe.test.mjs)：本机静态站点与另一个 origin 的 HTTPS 测试供应商，执行真实 CORS 预检。
- [单次真实网关实验](../../scripts/direct-provider-probe-live.mjs)：读取本机配置到内存，Key 不写入产物/报告/截图，不自动重试。
- [Nx 入口](../../project.json)：`direct-probe-build`、`direct-probe-serve`、`direct-probe-test`、`direct-probe-live`；均不依赖现有 API 启动或数据库。

API Key 只在当前页面内存。此页没有 RxDB/持久任务，不标记“已保存到本机作品库”；仅在验证真实图片后提供下载。

## 自动化证据

命令：

```sh
pnpm nx run aiao-media:direct-probe-test
```

六项测试通过：

1. 真实浏览器预检通过后发送一次带鉴权的 POST，解码 PNG，下载字节与 fixture 一致；刷新不保留 Key、不重新生成。
2. 预检拒绝时没有发送生成 POST，不自动重试，不显示下载成功。
3. 不同 origin 的结果图片可读取，下载请求没有 Authorization、Cookie 或 Referer。
4. 401 与损坏图片均不标记成功，供应商错误正文不进入 UI，也不回显 Key。
5. 同一活动请求期间连续提交只发起一次生成。
6. 桌面与手机宽度下无横向溢出；静态服务器对 API/环境文件返回 404、对 POST 返回 405。

fixture 图片用于协议和浏览器验证，不是真实模型生成证据。该命令同时运行新增脚本与浏览器 JS 的 ESLint。

## 当前真实网关结果

2026-10-23 13:47:56（Asia/Shanghai），使用已有私有配置，在 `http://127.0.0.1:4310` 页面通过真实 Chrome 点击一次生成：

- OPTIONS 状态：403。
- `Access-Control-Allow-Origin`、`Access-Control-Allow-Methods`、`Access-Control-Allow-Headers`：均未返回。
- 浏览器预检响应：403。
- Chrome CORS 原因：`PreflightMissingAllowOriginHeader`。
- 浏览器未进入供应商图片 POST 响应阶段，没有生成或下载到图片，无自动重试。

403 的上游原因尚未进一步确认，可能涉及网关/来源策略；本记录只确认当前 origin 的浏览器直连被预检阻断，不推断所有供应商或正式域名均不可直连。

脱敏报告、清空 Key 后的浏览器截图保存在 Git 忽略的 `tmp/direct-provider-probe/live-attempt.json` 与 `live-browser.png`。页面保守显示“请求结果未知”；本次诊断结合 Chrome 的实际预检事件明确阻断点，不把一般 fetch 错误都判为 CORS。

## 尚待验证

- 至少一种真实供应商在正式静态 origin 的生成与文件回读。
- 用户主动选择的可选代理及其 Key 使用、目标限制和免费额度边界。
- 正式 origin 的真实供应商生成与文件回读。
- 目标移动设备中文输入、存储策略和下载行为。

以上不通过 fixture 或本次命令的退出成功替代验收。后续实施以[当前路线图](../roadmap.md)和[静态部署方案](../../deploy/local-first-pages.md)为准。
