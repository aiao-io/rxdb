# aiao-desktop

浏览器里的 macOS 风格桌面，用 Angular 实现：开机与锁屏、菜单栏、Dock、窗口管理、启动台、聚焦搜索、通知中心，以及启动台里的 29 个内置应用。终端用 [Vivari](https://vivari.run) 在页面里运行 Node、npm 与 Python。产品没有服务端，也不保存状态，刷新即回到初始状态。

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

## 托管要求

产物是纯静态文件。托管方必须对所有响应返回 `Cross-Origin-Opener-Policy: same-origin` 与 `Cross-Origin-Embedder-Policy: require-corp`，否则终端无法启动（[D-05](requirements/decisions.md#d-05终端依赖跨源隔离)）。壁纸、地图、天气等外网内容拿不到时应用照常可用（[D-04](requirements/decisions.md#d-04外网内容可缺失)）。目前没有正式部署目标。
