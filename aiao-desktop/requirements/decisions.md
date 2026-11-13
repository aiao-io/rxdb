# Aiao Desktop 决策

## D-01：产品需求独立管理

Aiao Desktop 使用 `ADESK-US-*` / `ADESK-EPIC-*` 编号，在本目录独立统计和验收（前缀由用户于 2026-11-12 拍板）。`DESKTOP` 前缀属于另一个产品 Web Desktop，两者不共用。平台能力留在根 requirements，用 `capabilities` 引用；平台故事完成不代表本产品已接线或验收。结构门禁的校验逻辑在仓库共用的 `scripts/audit/app-requirements.mjs`，本产品只绑定自己的前缀。

## D-02：产品根目录与应用拆分

按[应用级需求与项目治理办法](../../requirements/application-governance.md)，Aiao Desktop 是多个 Nx 应用组成的一个产品，产品根放在仓库根的 `aiao-desktop/`，与 `aiao-model-design/` 同一布局。拆成两个应用：`apps/web`（Angular 桌面）与 `apps/e2e`（对正式构建跑的浏览器冒烟），两者共用前缀 `ADESK` 与本目录。组成由用户于 2026-11-12 拍板，三个选项是「web + e2e」「再并入 Web Desktop」「只放 web」；`apps/web-desktop` 是另一个产品，原地不动。

产品根保留 `aiao-desktop` 这个 Nx 项目名，承载需求门禁、安全门禁与聚合验证 `verify`；子项目名加后缀（`aiao-desktop-web`、`aiao-desktop-e2e`）。e2e 只通过 web 的构建产物验证行为，不 import web 的源码。眼下没有跨应用共用的代码，不建产品私有包；出现真实的共用需要时，按治理办法建 `@aiao-desktop/*` 私有包。

## D-03：只有前端，不带任何密钥

产品没有服务端、账号，也不调用需要授权的第三方接口，前端产物里不能出现任何密钥。`aiao-desktop:audit-secrets` 扫描 web 的构建产物，命中密钥形状即失败，只报文件与类型，不回显取值。以后要接入需要密钥的服务，先立故事加服务端应用，密钥只放服务端。

## D-04：外网内容可缺失

壁纸与照片（Unsplash、Wikimedia）、地图瓦片（CARTO）、地名搜索（Nominatim）、天气（Open-Meteo）、Safari 阅读模式（r.jina.ai）、网站图标（DuckDuckGo）、Safari 里的视频嵌入（YouTube）与网页字体（Google Fonts）都来自外网，且都不需要密钥。它们加载失败时应用照常打开，页面不出现错误；冒烟拦截全部外网请求来守住这一点，只放过资源加载失败的控制台信息。外网内容本身的显示效果不在当前验收范围内。

这些请求会让第三方看到用户的 IP；Safari 阅读模式还会把用户输入的网址、地名搜索会把搜索词发给对应的第三方。来源、用途与会发送的数据的说明由 [ADESK-US-007](stories/platform/ADESK-US-007-external-content-disclosure.md) 交付，交付后这份主机列表以代码里的清单为准。

## D-05：终端依赖跨源隔离

终端用 `@vivari/core` 在页面里运行 Node、npm 与 Python，要求页面处于 `crossOriginIsolated`：托管 web 产物的服务必须返回 `Cross-Origin-Opener-Policy: same-origin` 与 `Cross-Origin-Embedder-Policy: require-corp`。开发服务器的 development 配置、`serve-static` 与冒烟里的静态服务器都带这两个响应头；production 配置的开发服务器不带。Vivari 的 worker 与运行时资源由构建从 `node_modules/@vivari/core/dist/assets` 复制到产物的 `assets/`。

## D-06：本地开发用固定端口与开发导航

本地开发统一用 `pnpm nx dev aiao-desktop` 启动，做法参考 aiao-media 的开发入口（2026-11-12 用户要求）。端口固定：Web 开发服务器 4410、正式构建预览 4411、开发导航 4412，统一登记在 `scripts/dev/services.mjs`，与仓库里多数 Angular 应用的 4200、Web Desktop 与 aiao-media 的 4300 段、aiao-model-design 的 4400 段错开。端口被占用时直接失败，不自动换号，因为导航页上的链接依赖固定地址。

产品没有服务端，开发导航由产品根的本地 Node 服务提供：只监听 `127.0.0.1`，只接受指向本机的 Host，不进入 web 的构建产物，页面里也不放任何密钥（[D-03](#d-03只有前端不带任何密钥)）。正式构建预览不随代码热更新，不随 `nx dev` 启动，需要时单独运行。

## D-07：系统数据存在本地 SQLite

系统数据都存在浏览器本地的一个 RxDB 库里：磁盘的目录树与元数据、系统设置、桌面图标位置、最近使用，以及各内置应用的数据。技术栈是 `@aiao/rxdb` 加 `@aiao/rxdb-adapter-sqlite-wasm`，接法与 dev-rxdb-angular 相同：OPFS 可用时，库文件在专用 Worker 里以 OPFSCoopSyncVFS 落在 OPFS，否则用 IndexedDB。用户于 2026-11-12 拍板：用仓库自己的 RxDB 与现成插件管理全部数据，不另造存储；适配器在 sqlite-wasm 与 wa-sqlite 之间选了前者，因为它带 FTS5。

首次打开时写入内置内容，之后保留所有改动，这取代了 [ADESK-US-101](stories/desktop/ADESK-US-101-desktop-shell-baseline.md) 范围里的「不保存状态」。初始数据按数据域各写一次：每个域在一个事务里写入数据和 `seed:<domain>` 标记，要么完整写入，要么什么都没写。改了内置内容只影响新库与抹掉后的磁盘，已有的库不会被覆盖；`/Applications` 下的 `.app` 包元数据是例外，它由应用清单投影，清单升级时补齐，见 [D-17](#d-17应用清单是唯一真相源applications-是系统投影)。外网内容（壁纸、地图、天气、网页）不进库（[D-04](#d-04外网内容可缺失)）。

## D-08：文件体由 storage 插件放在 OPFS

磁盘的目录树是 `@aiao/rxdb-plugin-tree` 的邻接表实体 `DesktopFile`，记录父子关系、名字、种类、大小、MIME 与修改时间。文件体交给 `@aiao/rxdb-plugin-storage`，按随机名平铺在 OPFS 的 `aiao-desktop-files/blobs/` 下，所以改名与移动只改目录树，不搬文件体。用户于 2026-11-12 在「内容也存 SQLite」和「交给 storage 插件」之间选了后者。

二进制文件能生成的做成真格式：插画渲染的 PNG / JPEG、文本 PDF、合成的 WAV；其余（视频、mp3、heic、xip、dmg、key、numbers、ttf）是带正确文件头的小占位文件。Finder 与终端显示的大小、日期都是真实值，日期是首次复制进去的时刻。磁盘工具的「抹掉」会删光文件行与文件体，再写入内置内容。

## D-09：终端按需复制磁盘

终端打开时才把磁盘复制进 Vivari（Vivari 自己的文件系统镜像也在 OPFS）。所有终端窗口与终端标签共用一台虚拟机（每个浏览器标签页各有自己的一台，见 [ADESK-US-105](stories/desktop/ADESK-US-105-multi-tab-sync.md)），最后一个终端标签关掉时先把改动写回库，再拆掉虚拟机。磁盘挂在虚拟机的根目录下，主目录是 `/Users/prasenjit`，与 Vivari 自己的 `/bin`、`/tmp` 等并列。

Vivari 1.3.0 的 fs-change 事件不报虚拟机里进程自己的写入，所以终端这边的改动靠扫描发现：终端输出停下 0.3 秒后扫描一次，另外每 3 秒扫描一次，发现的改动写回库。桌面这边的改动按路径推进虚拟机，并刷新扫描基线，不会被当成终端的改动再写回来。`node_modules` 不同步，与 Vivari 自己的持久化规则一致（用户于 2026-11-12 拍板）。

自带的 `sh` 打了最小补丁：展开 `~` 与 `$NAME`，`cd` 不带参数时回主目录，在主目录时提示符显示 `~`。另外补了 `touch`、`mv`、`cp`、`open` 四个命令，`open` 把文件交给桌面上对应的应用打开。补丁对不上新版 `@vivari/core` 时直接报错，单测对仓库里安装的版本做断言。

## D-10：应用分三类，登记在同一张表里

桌面里的应用分三类，登记在同一张登记表 `apps/registry.ts` 里（用户于 2026-11-13 提出：桌面除了自带的应用，还要以微前端方式集成其他 B/S 应用）：

| 类别     | `kind`    | 是什么                                    | 怎么运行                                                       |
| -------- | --------- | ----------------------------------------- | -------------------------------------------------------------- |
| 系统入口 | `system`  | 启动台、废纸篓                            | 不开窗口，由桌面直接处理                                       |
| 内置应用 | `builtin` | 随桌面构建的 Angular 组件                 | 在窗口里直接渲染，可以用桌面的服务与本地库（D-07）             |
| 集成应用 | `web`     | 独立开发、独立部署的 Web 应用（B/S 应用） | 经 Orbit 在窗口里的 iframe 中运行（D-11），只经 Orbit 协议往来 |

三类共用 id、名称、图标、窗口尺寸与单 / 多窗口这些字段，启动台、聚焦搜索、Dock 与菜单栏对它们一视同仁。登记表随桌面构建发布，是运营方批准的清单：集成应用只能指向登记过的入口，不能在运行时添加任意网址；运行时应用分发（安装、卸载、更新、回退）还没有立项，见 [future-requirements](future-requirements.md)。登记表在桌面页启动时校验，不合规直接报错，不跳过也不降级。

运行来源（`builtin-component` / `bundled-html` / `remote-web`）与安装来源（`preinstalled` 等）是另外两个维度，由 [D-17](#d-17应用清单是唯一真相源applications-是系统投影) 补充；本条的分类、登记表规则与校验仍然有效，对应关系见[术语表](README.md#术语)。

## D-11：集成应用经 Orbit 隔离运行

集成应用用仓库自己维护的 `@aiao/orbit` 运行（第一版 Web Desktop 也用它，但两个产品各自接线）：桌面页一个运行内核，允许来源从登记表推导，只放行集成应用入口的精确来源；每个窗口一个实例，应用在独立的 iframe 文档里运行，桌面不代理也不改写应用的 DOM 与样式。

窗口与实例一一对应：打开即装载，应用显式报告就绪后才算打开成功；最小化动画结束后通知应用隐藏，还原前通知显示，iframe 始终不移动、不重载；关闭即销毁。失败（加载失败、超时、应用自报失败、整页导航）只影响所在窗口，窗口给出原因与重试，重试新建实例。父页面无法感知焦点在两个跨源 iframe 之间移动，所以后台的集成应用窗口盖激活层，点一下只激活窗口，再把键盘焦点交给应用。

隔离边界沿用 Orbit 的说明：sandbox 放行脚本、同源存储、表单与下载，不放行弹窗、模态框与顶层导航；它隔离文档与样式，不是防恶意代码的安全边界，所以只接运营方批准的应用。浏览器权限按登记表逐项授予，跨源隔离经 `cross-origin-isolated` 委派。

Orbit 是两个产品共用的包：Aiao Desktop 与 Web Desktop 各自接线、各自验收。本产品为它新增的公开接口（`@aiao/orbit/window`、实例的 `focus()`、文档加载后未握手即失败）保持向后兼容；确需破坏性变更时，先评估 Web Desktop 的接线。验收证据（`packages/orbit` 的单测与浏览器测试）随 Orbit 的测试一起跑，不在本产品里重复。

## D-12：集成应用的接入契约

桌面为了终端处于跨源隔离（D-05），带 COEP 的页面只能嵌入明确允许被跨源嵌入的文档。一个 B/S 应用要接入桌面，必须满足：

1. 入口是 HTTPS 地址，文档响应带 `Cross-Origin-Embedder-Policy: require-corp`（或 `credentialless`）与 `Cross-Origin-Resource-Policy: cross-origin`。缺了 CORP，浏览器直接拦下 iframe（`ERR_BLOCKED_BY_RESPONSE`）。
2. 接入 `@aiao/orbit/client`：在路由与业务初始化之前调用 `connectOrbitClient()`；真实渲染完成后调用 `ready()`；启动失败调用 `fail(原因)`。独立打开（不在桌面里）时 `connectOrbitClient()` 返回空，应用照常启动。
3. 不做整页导航（Orbit 视为失败）；不依赖弹窗、模态框与文件选择器；数据留在应用自己的来源里。

接入说明写在[产品 README](../README.md#接入集成应用)。契约以后要放宽（例如放行弹窗、由桌面代办文件选择）时，先改 Orbit 与本条，再立故事。

## D-13：Aiao Code 用线上发布版本

第一个集成应用是 Aiao Code（仓库里的 `apps/aiao-vscode`），桌面登记的入口是它的线上地址 `https://vscode.aiao.io/`（用户于 2026-11-13 指定），不打包进桌面，也不固定版本：Aiao Code 发布即生效，Orbit 的版本标识只是身份元数据。代价是 Aiao Code 的发布可能弄坏桌面里的接入，所以 Aiao Code 的发布流程在发布后要跑桌面的线上验收（`aiao-desktop-e2e:verify-aiao-code`）；冒烟拦截全部外网请求，用替身应用验证桌面这一侧，不依赖线上。

Aiao Code 为接入补了 `Cross-Origin-Resource-Policy: cross-origin`，带 COEP 的任意站点都能嵌入它；嵌入范围本来就不受限（没有 `frame-ancestors`），这次没有收紧，避免打断第一版 Web Desktop 对它的嵌入。

## D-14：透明窗口与窗口接口（参考 Tauri）

用户于 2026-11-13 提出：Aiao Code 外面多套了一层桌面画的标题栏，应用应该支持「透明窗口」，调用桌面的关闭、最小化、缩放，设计参考 Tauri。于是集成应用的窗口分两种外观：

| 外观     | 登记表 `web.frame` | 桌面画什么                                             | 应用画什么                                     |
| -------- | ------------------ | ------------------------------------------------------ | ---------------------------------------------- |
| 标准窗口 | `standard`（默认） | 标题栏、红黄绿、窗口形状、阴影与缩放边                 | 标题栏以下的内容                               |
| 透明窗口 | `transparent`      | 只有窗口形状、阴影与缩放边；加载中与失败时临时画标题栏 | 标题栏、红黄绿与拖动区，按钮调用桌面的窗口接口 |

对应 Tauri 的三件东西：`decorations: false` 对应透明窗口，`getCurrentWindow()` 对应 `@aiao/orbit/window` 的同名函数（`minimize`、`toggleMaximize`、`close`、`setTitle`、`setDecorations`、状态与订阅），`data-tauri-drag-region` 对应 `data-orbit-drag-region`。接口放在 Orbit 而不是桌面私有包里，因为接入方（Aiao Code）是另一个应用；协议是 Orbit 的普通请求与事件，实例绑定保证应用只能操作自己的窗口。

两处与 Tauri 不同，都是 iframe 带来的：

1. 登记表只批准「可以透明」，应用在运行时调用 `setDecorations(false)` 才生效。Tauri 的配置和前端代码一起发布，不会不一致；集成应用独立发布，旧版本或还没接入的应用不调用，就保持标准窗口，不会出现没有按钮可点的窗口。加载中与失败时桌面也一直画标题栏。
2. 拖动区不转发指针：在跨源 iframe 里按下鼠标后，后续指针事件都归 iframe，父页面收不到。所以应用只上报拖动区的形状（矩形减去其中的按钮、输入框），桌面在 iframe 上方盖同形状的拖动层，自己处理拖动与双击缩放；拖动层里的空白收不到应用自己的鼠标事件，与 Electron 的 `app-region: drag` 一样。

平台目前只有 `macos`：应用按 macOS 的样子把红黄绿画在左侧。以后桌面有了 Windows 外观，平台值随之扩展，应用按平台决定按钮的样子和位置，与 Tauri 应用按 `platform()` 区分一样。

## D-15：随桌面发布的单文件游戏在同源 iframe 里运行

用户于 2026-11-13 把单文件 3D 游戏 `saltline.html`（「几猫3A大作」，three.js 与音效都打包在文件里）放进 `apps/web/public/`，要求做成桌面里的应用，并指出 `public/` 里的文件随桌面一起发布、与桌面同源。所以它登记为内置应用（D-10），窗口组件用相对地址的 iframe 加载这个文件（[ADESK-US-103](stories/desktop/ADESK-US-103-saltline-game.md)），不当作集成应用：

- 不经 Orbit：集成应用要 HTTPS 的独立入口、握手与 sandbox（D-11、D-12），sandbox 不放行指针锁定，而第一人称射击游戏离不开它；游戏是现成的打包产物，也没有 Orbit 客户端。桌面原样发布这个文件，不改动它。
- 同源即受信：iframe 不加 sandbox（同源文档即使拿到 `allow-scripts allow-same-origin` 也能自己摘掉 sandbox），游戏能访问桌面来源下的存储与父页面，所以只放运营方自己发布的文件。游戏的设置存在 localStorage 的 `saltline.settings.v1`，与桌面的数据（D-07）互不相干。
- 跨源隔离：带 COEP 的桌面只能嵌入同样带 COEP 的文档。托管方本来就要对所有响应返回 COOP 与 COEP（D-05），同源文档自然满足；游戏不能引用外部资源，否则会被 COEP 拦下，单测检查这一条。
- 代价：同源 iframe 与桌面共用渲染主线程，游戏卡顿会拖慢整个桌面。有 GPU 时游戏约每秒 60 帧，桌面照常响应；CI 的无头 Chromium 只有软件 WebGL（约每秒 1 帧），所以冒烟用替身页验证窗口这一侧，只单独启动一次真游戏。桌面最小化窗口时不通知游戏：游戏在退出指针锁定与页面隐藏时自己暂停，隐藏的窗口里游戏循环照常运行。

运行来源在 [D-17](#d-17应用清单是唯一真相源applications-是系统投影) 里记为 `bundled-html`；登记表里它的 `kind` 仍是 `builtin`。

## D-16：发布到 Cloudflare Pages，一键发布命令

用户于 2026-11-13 要求把 Aiao Desktop 发布到 Cloudflare，并建立一键发布命令（[ADESK-US-003](stories/platform/ADESK-US-003-cloudflare-pages-deploy.md)）。这是产品第一次对外托管，边界随之改变：

- 托管：Cloudflare Pages 项目 `aiao-desktop`（经典 Pages，与 `aiao-vscode` 同一做法），生产分支 `main`，生产地址 `https://aiao-desktop.pages.dev`。产物是纯静态文件，没有 Functions，不带任何密钥（[D-03](#d-03只有前端不带任何密钥)）；发布凭据只在发布者本机（wrangler 的 OAuth 登录），不进仓库、不进构建产物，也不进 CI。
- 随构建发布的两个托管配置放在 `apps/web/public/`：`_headers` 对全站返回 COOP 与 COEP（[D-05](#d-05终端依赖跨源隔离)）；`_redirects` 把 `/saltline.html` 200 改写成原样返回——Pages 默认把 `.html` 308 到无扩展名地址，而浏览器会长期缓存这条 308，游戏的 iframe 又直接加载 `saltline.html`（[D-15](#d-15随桌面发布的单文件游戏在同源-iframe-里运行)）。
- 一键命令是 `pnpm nx run aiao-desktop:deploy`：Nx 先完成正式构建与密钥扫描，`scripts/deploy/deploy.mjs` 再检查产物、首次发布时新建项目、上传，最后把线上文件与本地产物逐个对账。`--dry-run` 只检查不发布，`--preview` 发布到 Preview 分支而不动生产。

几个有意的选择：

1. **分支显式传 `--branch main`**：wrangler 省略它时取当前 Git 分支，只会更新 Preview，在功能分支上发布时尤其容易误以为发到了线上。
2. **wrangler 固定版本（4.158.0），经 `pnpm dlx` 取用，不进依赖**：发布工具只在发布者本机用，不让依赖图和锁文件跟着它变。新建项目的 `--force`、子进程的 DNS 顺序这类踩坑细节见 [ADESK-US-003](stories/platform/ADESK-US-003-cloudflare-pages-deploy.md) 的技术笔记。
3. **线上核对逐文件比字节**：Pages 对不存在的路径回 `index.html` 且状态码 200，只看状态码会假绿。本次部署独有的地址逐文件核对，并要求每个响应都带 COOP 与 COEP；生产地址与自定义域名只核对入口页（入口页引用带哈希的脚本文件名，指向旧部署时一定不一致），免得在慢网络上把同样的 13 MB 反复下载。
4. **先等地址连得上**：新建项目的 `*.<项目>.pages.dev` 证书要几分钟才签发，这段时间部署地址与分支别名都是 TLS 握手失败（首次发布实测），生产地址 `<项目>.pages.dev` 不受影响。命令会提示并等待，超时才算失败。
5. **不重复跑冒烟**：发布前的完整门禁是 `aiao-desktop:verify`（与 CI 同款），发布命令只守住托管相关的失败（响应头、文件内容、域名）。发布后的浏览器级验收是 `aiao-desktop-e2e:verify-aiao-code --desktop-url=<线上地址>`：线上桌面加线上 Aiao Code 的真实组合。

回滚：命令在发布前读出当前的生产部署并在结尾打印，在 Pages 面板的部署页回滚到它。Pages 没有绑定自定义域名的 CLI，域名由用户在面板 Custom domains 里绑定；绑定后下一次发布自动把它加入核对。建议绑定 aiao.io 下的域名（如 `desktop.aiao.io`）：与 `vscode.aiao.io` 同站，桌面里的 Aiao Code 不再按顶层站点分区存储（见[后续方向](future-requirements.md)）。

## D-17：应用清单是唯一真相源，Applications 是系统投影

**状态：已接受，尚未实现**（[ADESK-US-205](stories/application/ADESK-US-205-application-management.md)）。

应用的身份、来源、运行类型、展示位置、Dock 默认固定状态和是否可移除，都登记在应用清单中。`/Applications` 里的 `.app` 是清单的系统投影：首次建库或清单升级时幂等生成包元数据，不能再维护一份独立的应用名称数组。包通过稳定的 `appId` / `bundleId` 回到清单，显示名只用于界面，不参与启动匹配。

应用按运行来源分为 `builtin-component`、`bundled-html` 与 `remote-web`。`bundled-html` 用随构建发布的相对入口运行，例如 `apps/web/public/saltline.html`；它进入 Applications、Launchpad、Spotlight 与 Dock 的方式和 Angular 内置应用一致，但只有打开窗口时才创建同源 iframe。`remote-web` 也进入 Applications，表示由清单管理的 Web 应用包（安装来源仍是预装）；它仍只能加载清单里的精确 HTTPS 入口并经 Orbit 运行。Launchpad、Trash 等系统入口可以登记在同一清单里，但用展示策略明确不出现在 Applications。

与 [D-10](#d-10应用分三类登记在同一张表里) 的登记类别对应如下：

| 登记表 `kind` | 运行来源            | 例子                  | 安装来源       |
| ------------- | ------------------- | --------------------- | -------------- |
| `builtin`     | `builtin-component` | Finder、Calculator 等 | `preinstalled` |
| `builtin`     | `bundled-html`      | 几猫3A大作            | `preinstalled` |
| `web`         | `remote-web`        | Aiao Code             | `preinstalled` |
| `system`      | —（不开窗口）       | 启动台、废纸篓        | —              |

当前版本只有预装应用（安装来源 `preinstalled`），没有目录安装（`managed`）和用户输入网址安装（`user`），后两者见 [future-requirements](future-requirements.md)。预装应用的完整 `.app` 包路径由系统保护：Finder、终端同步、文件系统 API、移动、改名、覆盖、移入废纸篓和清空废纸篓都不能移除它；抹掉磁盘后由清单重新生成。保护判断由应用目录服务提供，所有入口共用，不能只在某个 UI 菜单里禁用。

已有的本地库里，`/Applications` 的 `.app` 包由旧的手写列表种子生成，没有稳定标识。清单升级与首次建库走同一条幂等路径：补齐缺的预装包、补上稳定标识，不覆盖用户自己的文件，同名的非包条目保留。这是 [D-07](#d-07系统数据存在本地-sqlite)「已有的库不会被覆盖」对 `.app` 包的例外。

备选（实现前评估）：把 Applications 做成不落库的只读虚拟挂载，由清单实时投影。它没有清单漂移、没有已有库迁移，也没有「绕过保护」的写路径；代价是终端复制进虚拟机的磁盘镜像要单独投影这棵子树，Finder 的包内容查看要单独支持。本条按落库方案写；改用虚拟挂载时，保护与升级的机制随之改写，结果不变。

Applications、Launchpad、Spotlight、Dock 和菜单栏都从同一个清单投影。这样新增应用只需要增加清单和对应运行 loader，不会因为忘记修改磁盘种子或 Dock 常量而出现“能搜索但不能打开”“能打开但 Applications 没有”的分叉状态。详细范围与验收见 [ADESK-US-205](stories/application/ADESK-US-205-application-management.md)。

## D-18：应用懒加载与宿主系统能力统一

**状态：已接受，尚未实现**（[ADESK-US-206](stories/application/ADESK-US-206-lazy-app-runtime-and-host-capabilities.md)）。

桌面启动优先保证 shell 轻量：菜单栏、窗口管理、Dock、清单元数据、应用目录和系统服务急切加载，Finder 也按壳层处理——桌面启动后会自动打开一个 Finder 窗口，它的组件与磁盘服务随启动加载；其余任何应用实现、应用 seed、bundled HTML 入口和 remote-web iframe 都在真正打开时加载。预装描述的是安装与保护状态，不是加载策略。`registry.ts` 不再静态 import 所有内置组件，应用实现通过 dynamic import 拆成按应用加载的 chunk；应用数据初始化也按功能域延迟，触发点是该数据域第一次被读取，而不是第一次打开该应用：通知中心的小组件（日历、天气、股票、提醒事项）在壳层里读这些域，读取时触发对应域的种子。

组件、同源 HTML iframe 和 Orbit iframe 由同一个应用运行时管理生命周期：应用实例是 `registered → loading → ready → closing → closed`，失败走 `failed`；最小化、前台 / 后台、缩放是窗口的呈现状态，与实例生命周期正交，由 `WindowManager` 管。打开失败只影响当前窗口；重试创建新实例；关闭销毁组件、iframe、订阅和能力上下文。`WindowManager` 管窗口，运行适配器管具体应用载荷，不能让窗口管理器知道每种应用的内部实现。

应用通过绑定到 `appId` 与窗口实例的 `DesktopAppContext` 使用系统能力。第一批统一能力为 `window`、`menu`、`app`、`appearance`、`notification`、`clipboard` 与 `filesystem`。清单逐项声明权限，默认拒绝；内置应用通过 facade 接现有服务，remote-web 通过 Orbit RPC；bundled HTML 本阶段只统一生命周期、不提供能力 bridge——唯一的 bundled-html 应用 `saltline.html` 原样发布、不调用桌面接口（[D-15](#d-15随桌面发布的单文件游戏在同源-iframe-里运行)），出现第一个需要能力的 bundled-html 应用时再做。remote-web 永远拿不到父页面 DOM、RxDB repository、OPFS 原始句柄或未登记的任意 URL；调用失败返回稳定错误码，涵盖能力拒绝、参数错误、用户取消、浏览器权限拒绝、超时和窗口已关闭。`filesystem` 指桌面的虚拟磁盘，不是用户机器上的文件：sandbox 里的 iframe 弹不出浏览器的文件选择器，所以打开 / 保存由桌面自己的面板提供，应用只拿到用户选定的文件内容或保存位置；目录选择、多选与拖放数据通道不在第一批内。

`bundled-html` 的同源 iframe 是受信构建资产，不是安全隔离边界；它可以继续满足 `saltline.html` 的 pointer lock 与 fullscreen 需求。它纳入统一运行时的目的是生命周期一致；以后若提供 bridge，也不能把它描述成能防御恶意同源代码的 sandbox。非受信任的远程内容必须使用 `remote-web` 和 Orbit。

性能验收以正式构建为准：启动桌面（含自动打开的 Finder 窗口）、打开 Launchpad 和 Spotlight 时不能请求 Finder 以外的应用实现 chunk、应用独有的 seed、`saltline.html` 或任何 remote-web URL；打开一个应用只加载它需要的载荷；打开应用 A 不执行应用 B 的构造函数、订阅或独有的数据种子；首屏 initial 体积不超过实现前的实测值。详细范围与验收见 [ADESK-US-206](stories/application/ADESK-US-206-lazy-app-runtime-and-host-capabilities.md)。
