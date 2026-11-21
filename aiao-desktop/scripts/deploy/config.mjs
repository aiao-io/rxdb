import path from 'node:path';

/**
 * 发布到 Cloudflare Pages 的目标与约束，唯一登记处（D-16）。
 * 改项目名或分支时同步产品 README 的「发布」一节；新项目首次发布由 `deploy.mjs` 自动新建。
 */
export const deployConfig = Object.freeze({
  /** Cloudflare Pages 项目名；生产地址是 `https://<项目名>.pages.dev`，自定义域名在 Pages 面板绑定。 */
  projectName: 'aiao-desktop',
  /** 生产分支：发布到它才更新生产环境，其余分支只是 Preview。 */
  productionBranch: 'main',
  /** `--preview` 发布到的分支，地址是 `https://preview.<项目名>.pages.dev`。 */
  previewBranch: 'preview',
  /** 固定 wrangler 版本（经 `pnpm dlx` 取用，不进依赖），不同机器、不同时间发布的行为一致。 */
  wranglerVersion: '4.158.0',
  /** wrangler 的工作目录：要在仓库内，wrangler 才能把提交哈希与脏标记记到部署上；这里没有 wrangler 配置文件。 */
  workDir: path.resolve(import.meta.dirname, '../..'),
  /** web 的正式构建产物（`aiao-desktop-web:build`）。 */
  distDir: path.resolve(import.meta.dirname, '../../../dist/aiao-desktop/apps/web/browser'),
  /** 终端依赖跨源隔离（D-05）：托管方必须对所有响应返回这两个响应头。 */
  requiredHeaders: Object.freeze({
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp'
  })
});
