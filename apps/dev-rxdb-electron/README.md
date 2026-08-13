# dev-rxdb-electron

Angular + Electron 开发应用，位于 Nx monorepo 中。

## 环境

仓库固定使用 pnpm 10，请通过 Corepack 执行：

```bash
corepack pnpm --version
```

以下命令均从仓库根目录运行。

## 开发

仅启动 Angular renderer：

```bash
corepack pnpm nx serve dev-rxdb-electron
```

同时启动 Angular dev server、Electron 主进程 TypeScript watch 和 Electron：

```bash
corepack pnpm nx run dev-rxdb-electron:dev
```

开发端口固定为 `4120`。`dev` target 会等待 renderer 端口和 `src-electron/main.js` 都可用后再启动 Electron。

## 验证

```bash
corepack pnpm nx test dev-rxdb-electron
corepack pnpm nx lint dev-rxdb-electron
corepack pnpm nx build dev-rxdb-electron
```

Renderer production build 输出到：

```text
dist/apps/dev-rxdb-electron/browser/
```

`typecheck` 会连带检查 workspace 依赖；依赖项目存在基线错误时，不能把失败直接归因于 Electron 应用。

## Electron 打包

```bash
corepack pnpm nx run dev-rxdb-electron:electron-build
```

配置的发布目录是：

```text
dist/apps/dev-rxdb-electron/release/
```

2026-07-13 已验证 macOS arm64 发布链完整通过，产物为 `release/DevRxDBElectron-0.1.0-arm64.dmg` 和对应 blockmap。GitHub 下载线路过慢时，使用 Electron Builder 支持的镜像环境变量运行同一个 Nx target：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ \
corepack pnpm nx run dev-rxdb-electron:electron-build
```

这只切换构建工具下载源，不改变应用产物或运行时行为。其他平台产物仍必须在对应平台完成实际构建后再宣称可用。

## 打包 e2e

```bash
corepack pnpm nx e2e dev-rxdb-electron-e2e
```

该 target 依赖 `electron-package-dir`（`--dir` 解包产物），Playwright 直接拉起真实可执行文件。

跑一轮会把产物连开三次，因此**窗口默认隐藏**：`packaged-app.ts` 的 `launchEnv()` 会传入
`DEV_RXDB_ELECTRON_HIDE_WINDOW=1`，主进程据此以 `show: false` 建窗，并关掉后台节流
（不关的话 Chromium 会把不可见页面的 rAF 停掉，Playwright 的可操作性检查会全部超时）。
macOS 上同时调用 `app.dock.hide()`，避免应用启动时切走焦点与菜单栏。

排查失败用例需要肉眼看窗口时，显式关掉这个开关：

```bash
DEV_RXDB_ELECTRON_HIDE_WINDOW=0 corepack pnpm nx e2e dev-rxdb-electron-e2e
```

该变量只影响窗口是否显示，不改变加载路径、协议与存储位置。

## 项目结构

```text
apps/dev-rxdb-electron/
├── public/                 # Renderer 静态资源
├── src/                    # Angular renderer
├── src-electron/           # Electron 主进程、preload 与 contract tests
│   ├── main.ts
│   ├── preload.ts
│   └── *.spec.ts
├── electron-builder.json   # Electron Builder 配置
├── package.json            # 打包后的 Electron 应用元数据
├── project.json            # Nx targets
├── tsconfig.app.json       # Renderer TypeScript 配置
├── tsconfig.serve.json     # Electron 主进程 TypeScript 配置
├── tsconfig.spec.json      # Vitest TypeScript 配置
└── vitest.config.ts        # Vitest 配置
```

依赖统一由 workspace 管理；不要在 `src-electron/` 下维护第二份 package manifest。
