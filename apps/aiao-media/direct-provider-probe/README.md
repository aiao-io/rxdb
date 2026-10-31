# 最小静态供应商直连实验

这是 LF-0 可行性验证页：纯 HTML/CSS/JavaScript，由浏览器直接调用用户配置的 HTTPS 图片 API。无需登录、Bun API、SSR、数据库或代理服务。本次只验证调用和下载，尚未接入 RxDB、作品库或持久任务。

产品方向见[当前路线图](../requirements/roadmap.md)，结果见[本次实测记录](../requirements/plans/local-first-direct-probe-verification.md)。

## 启动与使用

```sh
bun --no-env-file nx run aiao-media:direct-probe-serve
```

打开 `http://127.0.0.1:4310`，在页面填写 Base URL、模型和 API Key，再点击生成。预览进程只提供静态文件，不接收图片生成请求。Key 仅保留在当前页面内存，不写 localStorage、sessionStorage、URL 或日志。

本页追加 `/images/generations`，发送 `n=1`、选择的 size、`quality=low`、`output_format=png`。当前只验证支持这些参数的供应商/模型；支持读取单张 `b64_json` 或 HTTPS 图片 URL。图片 URL 单独 fetch，绝不附加供应商 Authorization。

每次操作最多一次生成请求；有大小与超时限制，无自动重试。失败时先查看状态与供应商记录，不通过反复点击猜测是否收费。关闭/刷新后结果不会保留，成功后请下载。

## 构建与 Cloudflare 上传

```sh
bun --no-env-file nx run aiao-media:direct-probe-build
```

输出 `dist/direct-provider-probe`，只包含 `index.html`、`main.js`、`styles.css`、`_headers`。可将该目录用 Cloudflare Pages Direct Upload 发布；无 Functions、Worker、Key 或业务环境变量。实际账号/域名尚未配置，本次未发布公网地址。

本机 origin 与 Pages origin 的跨域结果不能互相代替。供应商按 origin 放行时，需对最终 Pages/custom 域名单独验证。

## 浏览器验证

```sh
bun --no-env-file nx run aiao-media:direct-probe-test
```

使用真实浏览器、独立 HTTPS 供应商 fixture 和真实 CORS 预检测试：成功调用与下载、拒绝预检、跨源图片不带 Key、错误响应与无效文件、重复提交、桌面/移动布局，以及静态服务不暴露 API/环境文件。fixture 不连接真实供应商，也不产生模型费用。

浏览器默认使用已安装的 Chrome，否则使用 Playwright Chromium；也可通过 `AIAO_PLAYWRIGHT_CHANNEL` 选择已安装渠道。截图存入 Git 忽略的 `tmp/direct-provider-probe/`。

真实网关检测显式读取本机已有 `.env` 中的 `AIAO_IMAGE_BASE_URL`、`AIAO_IMAGE_MODEL`、`AIAO_IMAGE_API_KEY`，不复制它们到网页产物。默认只发无 Key 的 OPTIONS 检查：

```sh
bun --no-env-file nx run aiao-media:direct-probe-live
```

只有显式设置 `AIAO_DIRECT_PROBE_GENERATE=1` 才会在真实浏览器中点击一次生成，可能消耗一张图片的供应商额度。该路径不进入普通测试或 CI，不自动重试；用独占的 `tmp/direct-provider-probe/live-attempt.json` 记录阻止覆盖已有尝试。报告和截图不包含 Key，原图仅在成功时下载到本机。

## 可选代理决定

产品已决定保留“本机直连”和“用户主动选择的我们代理”两条通道。代理会处理用户提供的 Key，默认按请求使用、不持久保存；不能把未知直连请求自动转成代理重发。本试验页尚未实现代理，详见计划中的 LF-P。
