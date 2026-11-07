# Orbit Web Desktop

浏览器内的本地桌面。React 宿主提供 macOS / Windows 两套交互方式，文件、文本编辑器、设置、应用目录和可选速记本作为独立 Web 页面通过仓内 `@aiao/orbit` 运行。文件、应用私有数据、授权和已保存会话保存在当前来源的 IndexedDB。

这是进行中的产品实现。完整范围为 42 条故事、256 条验收标准；代码与自动化测试的进展不代表实机、用户研究或正式部署已经验收。参见 [任务清单](../../specs/001-web-desktop-product/tasks.md) 和 [验收台账](requirements/verification-report.md)。

## 运行与验证

在仓库根目录安装锁定依赖，使用 Node 26+ 和仓库 `packageManager` 指定的 pnpm。

```bash
NX_NO_CLOUD=true NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm nx serve web-desktop
NX_NO_CLOUD=true NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm nx run web-desktop:requirements-check
NX_NO_CLOUD=true NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm nx run-many -p web-desktop -t lint,typecheck,test,build --parallel=1
NX_NO_CLOUD=true NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm nx run web-desktop:test --coverage
NX_NO_CLOUD=true NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm nx run web-desktop:e2e
```

开发和产物预览使用 `http://127.0.0.1:4300`。浏览器端到端测试依赖正式构建，在独立浏览器上下文运行，不访问日常浏览器中的桌面数据。首次运行 Playwright 前需准备仓库使用的 Chromium。`DESKTOP_TEST_OUTPUT` 可覆盖测试产物目录（相对 apps/web-desktop，Nx 输出仍须位于工作区内）；磁盘紧张时可用工作区内的父目录符号链接将产物实际存到数据盘。该输出不参与 Nx 缓存，不影响测试执行结果。

`build` 显式设置 `NODE_ENV=production`，防止调用者的开发环境关闭离线逻辑。开发服务不注册 Service Worker。需要测试离线行为时运行正式构建和 `web-desktop:preview`。

## 目录与协议

- `src/core`：文件模型、版本冲突、持久化校验、授权、备份和分块传输。
- `src/host`：窗口、交互模式、拥有权、RPC 服务、关闭协商和系统模态。
- `src/apps`：独立文件应用、编辑器、设置、应用目录。
- `tools`：资源清单、Service Worker 和需求结构检查。
- `e2e`：正式产物用户旅程。

应用身份由宿主实例与专属 MessagePort 绑定。文件和设置等服务默认拒绝，应用声明的能力还需用户授权；事务提交前重新检查权限和标签页写入权。所有应用均为运营方批准的可信同源代码。iframe 隔离文档、样式与生命周期；同源原生浏览器存储不会按应用自动隔离。

[桌面 SDK 契约](../../specs/001-web-desktop-product/contracts/desktop-sdk.md) 记录私有桌面协议。Orbit 单条消息上限仍为 1 MiB；较大文件、备份和剪贴板写入采用 128 KiB 原始字节分块、实例绑定、顺序检查和 SHA-256。导入单文件最多 50 MiB，每批最多 100 个文件、200 MiB；重名需要明确决定，替换检查版本，整批原子提交。

会话 v3 保存当前工作区、窗口层级、各区活动窗口，以及应用当前与上一版的资源指纹；旧 v1/v2 数据通过单次原子事务升级。备份恢复先验证原始摘要，再迁移内部数据。设置中的“只重置配置”恢复主题、字号、动态效果、固定入口、快捷方式和通知偏好，保留当前交互模式、文件、应用数据、授权、工作区及运行实例；与清除全部数据一样，需要两次确认。

文件管理器提供祖先面包屑和键盘导航；切换目录清除原搜索及选择，过期查询不会覆盖新目录。文档的初始文件引用只在实例启动时读取；切换主题、模式或字号不会重新加载已保存文档并覆盖后续草稿。

最近一次正式构建验证通过 33 条 Chromium 旅程和 162 条单元/浏览器集成测试；核心与窗口模型的覆盖率范围及完整产品缺口见验收台账。

## 应用位置与恢复

窗口提供后退、前进及菜单中的“打开位置…”，只影响目标实例。应用位置保留 path/query/hash；刷新恢复当前位置，新的导航历史从该位置开始，桌面地址保持不变。文件应用恢复目录、搜索和选择，设置恢复当前页面，编辑器恢复保存文档及行位置。跨文档导航会保护未保存内容，读取期间的新编辑也不会被迟到内容覆盖。

可恢复位置不接受跨来源 URL、越界路径及凭据参数；敏感的短期状态由应用自行持有。失败窗口重试保留原工作区、边界、状态和位置。窗口最小化前的还原状态、全部真实支持环境等剩余验收仍见台账。

## 运行与资源

桌面顶部的“运行与资源”显示静态预取和每个实例的后台状态。空闲 500ms 后才开始预取，最多同时准备两个版本；固定入口优先，前台打开可抢占纯后台任务，同版本共享下载。预取只下载并校验静态资源，不执行应用或请求权限，可以取消和继续。

最小化显示“已隐藏”。支持协议的应用可以显式挂起：先确认没有未保存内容和正在处理的操作，应用回复已保存后才显示“已挂起”。恢复保留原 iframe、目录、搜索和保存内容；未声明协议或有脏内容的应用在批量检查中列为需要处理。挂起状态只保留在当前会话内存中。

清理仅回收当前部署的无引用应用版本缓存，保留安装、回退、实例、准备任务及活 iframe 引用，不删除用户文件。更新和卸载取消相关预取，再根据剩余引用安排清理。

## 静态部署

构建结果位于 `apps/web-desktop/dist`。将整个目录作为同一版本原子部署到 HTTPS 来源；localhost 仅供本地开发与验证。浏览器需要 IndexedDB、Web Locks、BroadcastChannel、MessageChannel、Web Components 和 Web Crypto。不支持时界面会列出缺失能力。

根目录部署直接运行 `web-desktop:build`。子路径部署时，基址必须以 `/` 开始和结束：

```bash
DESKTOP_BASE=/desktop/ NX_NO_CLOUD=true NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm nx run web-desktop:build --skipNxCache
```

保持 `index.html`、`files.html`、`editor.html`、`settings.html`、`catalog.html`、`notes.html`、`sw.js`、`resources.json` 和全部 assets 的相对位置。HTML 与 `sw.js` 应要求重新验证；带内容哈希的 assets 可长期缓存。未知静态资源不能返回 HTML，`sw.js` 须使用 JavaScript MIME 类型，Service Worker 作用域限定在部署基址下。

允许宿主和应用相互 iframe 装载，保持同源 MessagePort、Worker、IndexedDB 和下载能力。不要在静态平台对 HTML 进行运行时注入或内容替换：离线安装会逐项验证构建资源的 SHA-256，内容不匹配会拒绝该版本。需要自定义 CSP 时，应按实际产物测试 `script-src`、`style-src`、`frame-src` 和 `worker-src`，并允许浏览器下载使用的 `blob:` URL。

应用独立版本来自 `src/core/approved-releases.json`。内置编辑器初始为 1.0.0，可在应用目录更新到 1.1.0（新增复制全文），也可回退。更新先显示变更、必需权限差异和数据兼容，再完整校验下载、明确新增授权、协商全部实例的未保存内容，最后原子切换安装与资源指纹。未启动的旧版若尚未绑定资源，更新会先自行下载并固定旧版回退包，不依赖后台预取。取消或下载失败保留旧版本；没有可验证恢复方案的迁移会被阻止。

构建为每个 appId/version 生成 `releases/<appId>/<version>/<SHA-256>/` 的不可变完整资源包，入口只引用包内脚本与样式。后续部署须保留已发布的 releases 归档；旧实例与备份固定原资源指纹，缺失时只尝试该归档，失败会明确报错。不要用同一路径替换新内容。Service Worker 仅在所有资源校验通过后写完整标记，不把半成品作为可切换版本。

外壳通过已有 `status` 消息协商资源协议 2（Orbit 协议仍为 1），启动请求最多等待 5 秒；旧 Worker 进入“桌面需要完成更新”，准备后由用户明确确认。根导航与 `index.html` 均使用当前完整缓存外壳，线上发布不会混入新 HTML。更新先处理全部脏文档，再保存文件引用、窗口与焦点，最后激活新 Worker 并刷新；取消关闭保留当前工作，升级时首次保存的文件也能恢复。

首次完整缓存后才显示“离线已就绪”。安装失败删除不完整版本缓存；更新等待用户确认并协商未保存内容。资源缓存与文件数据库分开管理。移除站点数据会删除本地文件，日常使用应主动导出文件或未加密桌面备份。

HTTPS 生产发布、真实 Safari / Edge / Windows、输入法、读屏和用户研究仍需在 [验收台账](requirements/verification-report.md) 留下实际记录。
