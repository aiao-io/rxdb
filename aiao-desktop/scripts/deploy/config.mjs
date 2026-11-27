import path from 'node:path';

/**
 * 发布到 Cloudflare Pages 的目标与约束，唯一登记处（D-16）。
 * 改项目名或分支时同步产品 README 的「发布」一节；新项目首次发布由 `deploy.mjs` 自动新建。
 */
export const deployConfig = Object.freeze({
  /** Cloudflare Pages 项目名；生产地址是 `https://<项目名>.pages.dev`，自定义域名在 Pages 面板绑定。 */
  projectName: 'aiao-desktop',
  /**
   * 已在 Pages 面板绑定的自定义域名（Pages 没有绑定它的 CLI，由用户在面板里绑）。只给 `inspect-live` 的只读核对用；
   * 发布时核对哪些自定义域名是从 Pages 项目动态读取的，不依赖这一项。绑了新域名或换域名时同步改这里。
   */
  customDomains: Object.freeze(['desktop.aiao.io']),
  /** 生产分支：发布到它才更新生产环境，其余分支只是 Preview。 */
  productionBranch: 'main',
  /** `--preview` 发布到的分支，地址是 `https://preview.<项目名>.pages.dev`。 */
  previewBranch: 'preview',
  /** 固定 wrangler 版本（经 `pnpm dlx` 取用，不进依赖），不同机器、不同时间发布的行为一致。 */
  wranglerVersion: '4.158.0',
  /**
   * wrangler 子进程的时限（毫秒），超时就终止它并让发布失败，免得网络停滞时无限期挂着。
   * `query` 是项目查询与新建（一次几秒的 API 调用，首次还包含 `pnpm dlx` 下载 wrangler）；`upload` 是上传整个产物目录（约 13 MB、上百个文件），给足慢网络的余量。
   */
  wranglerTimeoutMs: Object.freeze({ query: 300_000, upload: 600_000 }),
  /**
   * 别名与自定义域名在发布后的传播等待：这些地址在边缘节点传播完成前可能还回上一版部署，内容不一致时每隔 `intervalMs` 重试，
   * 最多等 `timeoutMs`，超时才算失败。本次部署独有的部署地址不等，要求立即一致。
   */
  propagation: Object.freeze({ timeoutMs: 120_000, intervalMs: 5000 }),
  /** wrangler 的工作目录：要在仓库内，wrangler 才能把提交哈希与脏标记记到部署上；这里没有 wrangler 配置文件。 */
  workDir: path.resolve(import.meta.dirname, '../..'),
  /** web 的正式构建产物（`aiao-desktop-web:build`）。 */
  distDir: path.resolve(import.meta.dirname, '../../../dist/aiao-desktop/apps/web/browser'),
  /**
   * 托管方必须对所有响应返回的响应头：终端依赖跨源隔离（D-05，COOP 与 COEP），桌面不允许被其他站点嵌入（D-16，X-Frame-Options）。
   * 不在全站规则里放 `Content-Security-Policy`：Pages 会把同名响应头拼起来，`/github-oauth-return.html` 自带的 CSP 会变成两条策略的拼接值。
   * 与 `public/_headers`、开发服务器、`serve-static` 与冒烟的静态服务器保持一致，由 `config.spec.mjs` 校验。
   */
  requiredHeaders: Object.freeze({
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'X-Frame-Options': 'SAMEORIGIN'
  })
});
