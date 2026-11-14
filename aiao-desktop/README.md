# aiao-desktop

浏览器里的 macOS 风格桌面，用 Angular 实现：开机与锁屏、菜单栏、Dock、窗口管理、启动台、聚焦搜索、通知中心，以及启动台里的内置应用，其中「几猫3A大作」是随桌面发布的单文件 3D 游戏。独立部署的 B/S 应用以微前端方式接入，经 `@aiao/orbit` 运行在桌面的窗口里，第一个是 Aiao Code（<https://vscode.aiao.io>）。终端用 [Vivari](https://vivari.run) 在页面里运行 Node、npm 与 Python。产品没有服务端：系统数据（磁盘目录树、系统设置与各内置应用的数据）存在浏览器本地的 SQLite 里（`@aiao/rxdb`），文件体由 storage 插件放在 OPFS，刷新后都还在，磁盘工具的「抹掉」把磁盘卷恢复成初始内容。数据只在当前浏览器的这个站点（Origin）下：清除站点数据、换浏览器或换域名都看不到原来的数据，目前没有备份与导出。终端打开时把磁盘复制进 Vivari，Finder 与终端看到并修改的是同一块磁盘。

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

本地开发自动连接 `@aiao/rxdb-devtools`，安装仓库的 [RxDB DevTools 浏览器扩展](../apps/rxdb-devtools-extension/README.md) 后即可检查桌面数据库与实体。仅 `development` 构建启用；正式构建与正式构建预览均不加载连接器，冒烟会检查生产 JavaScript 里没有 DevTools 代码、页面没有 DevTools 全局入口。

## 验证

```bash
pnpm nx run aiao-desktop:verify
```

它会跑需求门禁及其测试、密钥扫描及其测试、web 的 lint / typecheck / build / 逐文件覆盖率，以及 e2e 的 lint / 脚本测试 / 夹具自检 / Chromium 冒烟。单独跑冒烟用 `pnpm nx run aiao-desktop-e2e:e2e`，首次运行前要装好 Playwright 的 Chromium。冒烟覆盖的行为见 [ADESK-US-101](requirements/stories/desktop/ADESK-US-101-desktop-shell-baseline.md)。

已立项需求的验收结果见[状态总览](requirements/status-overview.md)和[原始证据](requirements/evidence/2026-11-14/README.md)。本轮按用户要求[只验收桌面 Chrome](requirements/decisions.md#d-19只验收桌面-chrome)；默认自动回归使用 Chromium，真实 Chrome 的高依赖能力记录单独归档。当前源码已包含应用目录与Dock管理、运行时懒加载、跨标签页同步、升级保护和布局恢复；真实物理键盘、VoiceOver、历史基线流程及正式发布仍按故事保留。Safari、Firefox与WebKit的已有结果保留为历史或可选诊断。

本机专项验收入口：

```bash
pnpm nx run aiao-desktop-e2e:e2e-firefox
pnpm nx run aiao-desktop-e2e:e2e-webkit
pnpm nx run aiao-desktop-e2e:verify-saltline
pnpm nx run aiao-desktop-e2e:verify-keyboard
pnpm nx run aiao-desktop-e2e:verify-domains
pnpm nx run aiao-desktop:inspect-live
```

键盘脚本需要操作者用手按键；读屏按[VoiceOver清单](apps/e2e/VOICEOVER.md)保留真实播报。`inspect-live`只读核对线上入口，不能代替`deploy`的本次发布对账。

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

3. **能力边界**：不做整页导航（Orbit 视为失败，要用 history 路由）；不依赖弹窗、`alert` / `confirm`（sandbox 不放行），也不依赖 `showOpenFilePicker()`、`showDirectoryPicker()` 这类文件句柄 API（跨源 iframe 里浏览器拒绝，抛 `SecurityError`）；数据留在应用自己的来源里。普通 `<input type="file">` 不在这条限制里，但它在 Orbit 的 sandbox 与桌面界面里能否使用没有验收，先在桌面里实测再依赖。

自带标题栏的应用可以用**透明窗口**（[D-14](requirements/decisions.md#d-14透明窗口与窗口接口参考-tauri)，参考 Tauri）：登记表写 `frame: 'transparent'`，应用自己画标题栏与红黄绿，用 `@aiao/orbit/window` 调用桌面的窗口操作：

```ts
import { getCurrentWindow } from '@aiao/orbit/window';

const appWindow = orbit && getCurrentWindow(orbit); // 不在桌面里或桌面没给窗口时为 undefined
if (appWindow?.state.frame === 'transparent') {
  // 标题栏元素加 data-orbit-drag-region（其中的按钮、输入框自动挖空），红黄绿调用 close / minimize / toggleMaximize
  appWindow.trackDragRegions(document);
  await appWindow.setDecorations(false); // 隐藏桌面的标题栏，就绪时生效
}
orbit?.ready();
```

桌面在加载中与失败时始终画自己的标题栏；应用不调用 `setDecorations(false)` 就保持标准窗口。窗口状态（是否在前台、是否缩放）经 `appWindow.state` 与 `onStateChange` 获得。

应用还可以经 `@aiao/orbit/desktop` 使用桌面的统一系统能力（窗口、菜单、打开应用、外观……，[ADESK-US-206](requirements/stories/application/ADESK-US-206-lazy-app-runtime-and-host-capabilities.md)）：`getDesktop(orbit)` 拿到能力，失败时抛带稳定错误码的 `DesktopError`；请求、错误码表、协议版本与限额见 [Orbit 的协议文档](../packages/orbit/README.md#桌面能力)。能力**默认拒绝**，逐项在清单的 `capabilities` 里声明；应用声明的协议版本高于桌面支持的版本时，窗口显示不兼容的原因，应用也收到明确的错误。

桌面这一侧在登记表加一项 `kind: 'web'` 的应用：名称、图标、窗口尺寸，以及入口地址、版本标识、要授予的浏览器权限（例如 `cross-origin-isolated; clipboard-write`）、授予的系统能力 `capabilities` 与就绪时限。浏览器权限（`allow`）与系统能力（`capabilities`）是两层，对 clipboard 的声明必须一致（只授一层，桌面启动即失败）。Orbit 的允许来源从登记表推导；登记项不合规时桌面启动即报错。冒烟拦截全部外网请求，用替身应用验证桌面这一侧；集成应用本身用它自己的线上验收脚本，Aiao Code 的是 `pnpm nx run aiao-desktop-e2e:verify-aiao-code`（要外网，不进 CI）。

## 内置游戏

「几猫3A大作」是一个单文件的 3D 射击游戏：[apps/web/public/saltline.html](apps/web/public/saltline.html) 打包了 three.js 与音效，随桌面构建原样发布到产物根目录。它登记为内置应用 `saltline`，窗口里的 iframe 用相对地址加载它，与桌面同源，不经 Orbit，所以游戏自己的指针锁定、全屏、手柄与设置照常可用（[D-15](requirements/decisions.md#d-15随桌面发布的单文件游戏在同源-iframe-里运行)）。

更新游戏只要替换这个文件，格式化工具不碰它。它不能引用外部资源，否则会被桌面的 COEP 拦下，单测会检查这一条。冒烟用的无头 Chromium 只有软件 WebGL，游戏每秒约 1 帧，整个页面跟着变慢，所以冒烟用替身页验证窗口行为，只单独启动一次真游戏（[ADESK-US-103](requirements/stories/desktop/ADESK-US-103-saltline-game.md)）。

## 托管要求

产物是纯静态文件。托管方必须对所有响应返回 `Cross-Origin-Opener-Policy: same-origin` 与 `Cross-Origin-Embedder-Policy: require-corp`，否则终端无法启动（[D-05](requirements/decisions.md#d-05终端依赖跨源隔离)）。壁纸、地图、天气等外网内容拿不到时应用照常可用（[D-04](requirements/decisions.md#d-04外网内容可缺失)）。线上部署在 Cloudflare Pages，见下一节。

## 发布

发布到 Cloudflare Pages 项目 `aiao-desktop`（[D-16](requirements/decisions.md#d-16发布到-cloudflare-pages一键发布命令)），生产地址 <https://aiao-desktop.pages.dev>。在仓库根执行，先切 Node 26：

```bash
pnpm nx run aiao-desktop:deploy             # 构建 → 密钥扫描 → 检查产物 → 上传到生产 → 线上逐文件对账
pnpm nx run aiao-desktop:deploy --dry-run   # 只构建并检查产物，打印将执行的命令，不发布
pnpm nx run aiao-desktop:deploy --preview   # 发布到 Preview 分支（https://preview.aiao-desktop.pages.dev），不动生产
```

首次使用要在本机登录 Cloudflare：`pnpm dlx wrangler@4.158.0 login`（账号需要 Pages 权限）。凭据只在本机，不进仓库，也不进构建产物；项目还不存在时命令会自动新建。

命令按顺序做这些事，任何一步失败就停下并以非零退出：

1. Nx 先完成 web 的正式构建与 `audit-secrets`。
2. 检查产物：有 `index.html` 与 `_headers`，`_headers` 的 `/*` 规则里 COOP / COEP 各恰好一次。
3. 项目不存在则新建；读出当前的生产部署，作为回滚点。
4. `wrangler pages deploy` 上传。分支显式给 `main`，在功能分支上执行也不会误发到 Preview。
5. 线上对账：部署地址的每个文件与本地产物逐字节一致且都带 COOP / COEP；生产地址与已绑定的自定义域名核对入口页。新项目的子域名证书要几分钟才签发，命令会等它就绪。

`_headers`（全站 COOP / COEP）与 `_redirects`（`/saltline.html` 200 改写）放在 [apps/web/public](apps/web/public)，随构建发布。改了响应头要同步 [config.mjs](scripts/deploy/config.mjs) 的 `requiredHeaders`，`deploy-test` 会校验两者一致。

发布后的浏览器级验收，用真实的桌面加真实的 Aiao Code（要外网）：

```bash
pnpm nx run aiao-desktop-e2e:verify-aiao-code --desktop-url=https://aiao-desktop.pages.dev
```

- **回滚**：在 Cloudflare 面板 Workers & Pages → aiao-desktop → Deployments 里选命令结尾打印的回滚点，Rollback to this deployment。回滚只换静态产物，不回滚浏览器里已升级的数据：数据升级过之后，先对照 [ADESK-US-106](requirements/stories/desktop/ADESK-US-106-database-upgrade-path.md) 的「回滚目标」表，早于降级保护的部署不能再作为回滚目标（[D-16](requirements/decisions.md#d-16发布到-cloudflare-pages一键发布命令)）。
- **自定义域名**：在同一个项目的 Custom domains 里添加（Pages 没有对应的 CLI），绑定后下一次发布会自动核对它的入口页。`desktop.aiao.io` 已绑定；2026-11-14在真实Chrome配置中核对了同站项目与已有GitHub登录状态，记录见验收台账。换域名也换了桌面自己的 Origin：本地库、文件体与设置不会自动出现在新地址，旧地址上的数据原样留在旧地址（[ADESK-US-004](requirements/stories/platform/ADESK-US-004-custom-domain.md)）。
- **发布前**：命令不重跑浏览器冒烟，完整门禁用 `pnpm nx run aiao-desktop:verify`。
