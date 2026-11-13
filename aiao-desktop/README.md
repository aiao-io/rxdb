# aiao-desktop

浏览器里的 macOS 风格桌面，用 Angular 实现：开机与锁屏、菜单栏、Dock、窗口管理、启动台、聚焦搜索、通知中心，以及启动台里的 29 个内置应用。独立部署的 B/S 应用以微前端方式接入，经 `@aiao/orbit` 运行在桌面的窗口里，第一个是 Aiao Code（<https://vscode.aiao.io>）。终端用 [Vivari](https://vivari.run) 在页面里运行 Node、npm 与 Python。产品没有服务端：系统数据（磁盘目录树、系统设置与各内置应用的数据）存在浏览器本地的 SQLite 里（`@aiao/rxdb`），文件体由 storage 插件放在 OPFS，刷新后都还在，磁盘工具的「抹掉」恢复初始内容。终端打开时把磁盘复制进 Vivari，Finder 与终端看到并修改的是同一块磁盘。

这是一个产品根目录：两个 Nx 应用共同组成同一个产品，按[应用级需求与项目治理办法](../requirements/application-governance.md)管理。产品需求、决策与验收台账见 [requirements](requirements/README.md)，目录边界与依赖规则见 [AGENTS.md](AGENTS.md)。仓库里的 [Web Desktop](../apps/web-desktop/README.md)（React 宿主与 Orbit 运行内核）是另一个产品。

## 结构

| 目录                 | Nx 项目            | 运行时                        | 职责                                                                        |
| -------------------- | ------------------ | ----------------------------- | --------------------------------------------------------------------------- |
| [apps/web](apps/web) | `aiao-desktop-web` | 浏览器（Angular）             | 桌面外壳、窗口管理与内置应用；构建输出到 `dist/aiao-desktop/apps/web`       |
| [apps/e2e](apps/e2e) | `aiao-desktop-e2e` | Node + Chromium（Playwright） | 对 web 的正式构建跑冒烟，外网请求全部拦截                                   |
| 产品根（本目录）     | `aiao-desktop`     | —                             | 本地开发入口与开发导航、需求门禁、密钥扫描，以及一次跑完全部门禁的 `verify` |

## 本地开发

在仓库根启动本地开发环境，先切 Node 26：

```bash
pnpm nx dev aiao-desktop
```

它先检查固定端口，再启动支持热更新的开发服务器，就绪后自动打开[开发导航](http://127.0.0.1:4412/)。导航页集中展示服务入口与实时状态（是否运行、跨源隔离响应头是否齐全）、常用命令（一键复制）、在 VS Code 中打开的文档与源码，以及当前检出位和分支。

| 服务           | 地址                   | 说明                                                                                |
| -------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| 开发导航       | http://127.0.0.1:4412/ | 随 `nx dev` 启动                                                                    |
| Web 开发服务器 | http://localhost:4410  | 随 `nx dev` 启动，也可单独 `pnpm nx serve aiao-desktop-web`；`?boot=0` 跳过开机动画 |
| 正式构建预览   | http://127.0.0.1:4411  | 按需 `pnpm nx run aiao-desktop-web:serve-static`，先正式构建，不随代码热更新        |

端口固定，与仓库里其他应用错开；被占用时报出占用的服务与地址后失败，不自动换号，也不停止占用者。端口统一登记在 [scripts/dev/services.mjs](scripts/dev/services.mjs)，由测试校验与各 Nx 目标一致。

- 无需自动打开浏览器：`AIAO_DEV_OPEN=false pnpm nx dev aiao-desktop`。
- 交互终端默认使用 Nx TUI，可切换查看各服务日志；`pnpm nx dev aiao-desktop --tui=false` 输出普通日志。
- Ctrl-C 停止全部服务。

开发服务器与正式构建预览都返回跨源隔离所需的响应头，终端才能启动 Vivari；开发服务器的 production 配置不带这两个头。开发导航只监听 `127.0.0.1`、只接受指向本机的 Host，不进入 web 的构建产物，页面里也没有任何密钥。

## 验证

```bash
pnpm nx run aiao-desktop:verify
```

它会跑需求门禁及其测试、密钥扫描及其测试、web 的 lint / typecheck / build，以及 e2e 的 lint 与冒烟。单独跑冒烟用 `pnpm nx run aiao-desktop-e2e:e2e`，首次运行前要装好 Playwright 的 Chromium。冒烟覆盖的行为见 [ADESK-US-101](requirements/stories/desktop/ADESK-US-101-desktop-shell-baseline.md)。

## 接入集成应用

桌面里的应用分三类：系统入口（启动台、废纸篓）、内置应用（本目录的 Angular 组件）与集成应用（独立部署的 B/S 应用），都登记在 [registry.ts](apps/web/src/app/apps/registry.ts) 里（[D-10](requirements/decisions.md#d-10应用分三类登记在同一张表里)）。集成应用经 [`@aiao/orbit`](../packages/orbit/README.md) 在窗口的 iframe 里运行，每个窗口一个实例（[D-11](requirements/decisions.md#d-11集成应用经-orbit-隔离运行)）。

一个 B/S 应用要接入桌面，应用这一侧要做三件事（[D-12](requirements/decisions.md#d-12集成应用的接入契约)）：

1. **托管响应头**：入口是 HTTPS 地址；文档响应带 `Cross-Origin-Embedder-Policy: require-corp`（或 `credentialless`）与 `Cross-Origin-Resource-Policy: cross-origin`。桌面为了终端处于跨源隔离，缺了 CORP 的文档会被浏览器直接拦下。
2. **握手与就绪**：在路由与业务初始化之前连接桌面，真实渲染完成后报告就绪，启动失败时报告原因：

   ```ts
   import { connectOrbitClient } from '@aiao/orbit/client';

   const orbit = await connectOrbitClient(); // 不在桌面里时为 undefined，照常独立启动
   await startApp();
   orbit?.ready(); // 启动失败时改为 orbit?.fail(原因)
   ```

3. **能力边界**：不做整页导航（Orbit 视为失败，要用 history 路由）；不依赖弹窗、`alert` / `confirm` 与文件选择器（sandbox 与浏览器都不放行）；数据留在应用自己的来源里。

桌面这一侧在登记表加一项 `kind: 'web'` 的应用：名称、图标、窗口尺寸，以及入口地址、版本标识、要授予的浏览器权限（例如 `cross-origin-isolated; clipboard-write`）与就绪时限。Orbit 的允许来源从登记表推导；登记项不合规时桌面启动即报错。冒烟拦截全部外网请求，用替身应用验证桌面这一侧；集成应用本身用它自己的线上验收脚本，Aiao Code 的是 `pnpm nx run aiao-desktop-e2e:verify-aiao-code`（要外网，不进 CI）。

## 托管要求

产物是纯静态文件。托管方必须对所有响应返回 `Cross-Origin-Opener-Policy: same-origin` 与 `Cross-Origin-Embedder-Policy: require-corp`，否则终端无法启动（[D-05](requirements/decisions.md#d-05终端依赖跨源隔离)）。壁纸、地图、天气等外网内容拿不到时应用照常可用（[D-04](requirements/decisions.md#d-04外网内容可缺失)）。目前没有正式部署目标。
