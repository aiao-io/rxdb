# aiao-desktop 产品约定

遵循仓库根 [AGENTS.md](../AGENTS.md) 的角色、代码哲学与铁律；本文件只补充本产品的目录边界与依赖规则。治理依据是[应用级需求与项目治理办法](../requirements/application-governance.md)。

## 产品组成

本目录是产品根：两个 Nx 应用服务同一个产品目标，共用需求前缀 `ADESK` 与 [requirements/](requirements/README.md)（产品级需求唯一真相源）。

| 目录       | Nx 项目            | tags                                                     | 说明                                                                 |
| ---------- | ------------------ | -------------------------------------------------------- | -------------------------------------------------------------------- |
| `.`        | `aiao-desktop`     | `scope:aiao-desktop`                                     | 本地开发入口 `dev` 与开发导航、需求门禁、密钥扫描、聚合验证 `verify` |
| `apps/web` | `aiao-desktop-web` | `scope:aiao-desktop` `type:app` `layer:ui` `angular-app` | Angular 桌面（浏览器）                                               |
| `apps/e2e` | `aiao-desktop-e2e` | `scope:aiao-desktop` `type:e2e`                          | 对 web 正式构建跑的 Chromium 冒烟                                    |

## 依赖方向

```text
apps/e2e ──（只读构建产物 dist/aiao-desktop/apps/web）──> apps/web
apps/web ──> 平台包（@aiao/rxdb、@aiao/rxdb-angular、@aiao/rxdb-adapter-sqlite-wasm、@aiao/rxdb-plugin-tree、@aiao/rxdb-plugin-storage、@aiao/utils、@aiao/orbit）
apps/web ──（运行时，经 Orbit 的 iframe）──> 集成应用的线上地址（https://vscode.aiao.io）
apps/e2e ──（只读构建产物 packages/orbit/dist，拼替身应用）──> @aiao/orbit
apps/web ──> 第三方库（@angular/*、rxjs、comlink、@xterm/*、@vivari/core）
产品根 ──（implicitDependencies）──> apps/web、apps/e2e
```

- e2e 不 import web 的源码，只对 web 的正式构建跑冒烟：`e2e` 目标依赖 `aiao-desktop-web:build`。改 web 时 `nx affected` 会带上 e2e 与产品根（需求文档链接到 web 的源码，产品根的需求门禁也要跑）。
- 系统数据存在本地 SQLite（[D-07](requirements/decisions.md#d-07系统数据存在本地-sqlite)）：web 经 `tsconfig.base.json` 的 paths 直接用根平台包的源码，`nx sync` 维护 tsconfig 的项目引用。实体只能经 RxDB 写入；新增实体登记在 `src/app/data/entities.ts`，初始数据登记在 `src/app/data/seeds.ts`。
- 目前没有产品私有包。出现跨应用共用的代码时，建 `packages/<name>`（`@aiao-desktop/<name>`，`private: true`），同时把 `aiao-desktop/packages/*` 加进 `pnpm-workspace.yaml`、在 `tsconfig.base.json` 加 paths，并按治理办法给 `layer:domain` 补依赖约束。
- 集成应用（[D-10](requirements/decisions.md#d-10应用分三类登记在同一张表里)～[D-13](requirements/decisions.md#d-13aiao-code-用线上发布版本)）只经 Orbit 协议与桌面往来，web 不 import 集成应用的源码；入口登记在 `src/app/apps/registry.ts`，Orbit 的允许来源从登记表推导，不另写。冒烟不访问外网，集成应用用替身页面验证；真实的线上验收是单独的脚本，不进 CI。
- 产品只有前端，不带任何密钥（[D-03](requirements/decisions.md#d-03只有前端不带任何密钥)）。`aiao-desktop:audit-secrets` 扫描 web 的构建产物，CI 的 extras job 会跑它。
- 终端依赖跨源隔离：托管 web 产物时必须返回 COOP `same-origin` 与 COEP `require-corp`（[D-05](requirements/decisions.md#d-05终端依赖跨源隔离)）。
- 本地开发的端口固定，统一登记在 [scripts/dev/services.mjs](scripts/dev/services.mjs)（[D-06](requirements/decisions.md#d-06本地开发用固定端口与开发导航)）。改端口时同步改 web 的 `serve`、`serve-static` 与产品根的 `dev`、`dev-dashboard`，`dev-test` 会校验它们一致。web 的 `serve` 先跑产品根的 `dev-ports`，这是唯一一条从子项目指向产品根的任务依赖，只用于开发时的端口检查。
- 开发导航（`scripts/dev/dashboard.mjs`）只在本地开发时运行、只监听 `127.0.0.1`，不进入 web 的构建产物，页面里不放任何密钥。
- 发布（[D-16](requirements/decisions.md#d-16发布到-cloudflare-pages一键发布命令)）：`scripts/deploy/` 只读 web 的构建产物，经 wrangler 发布到 Cloudflare Pages 项目 `aiao-desktop`；凭据只在发布者本机（wrangler 登录），不进仓库与产物。托管配置 `_headers`、`_redirects` 放在 `apps/web/public/` 随构建发布，响应头要与 `scripts/deploy/config.mjs` 的 `requiredHeaders` 一致（`deploy-test` 校验）。新增要被 iframe 直接加载的 `.html` 时，在 `_redirects` 补一条 200 改写，否则 Pages 会把它 308 到无扩展名地址。

## 前端约定（可访问性）

规则来自 [ADESK-US-108](requirements/stories/desktop/ADESK-US-108-accessibility.md)；新代码照着写，否则会写回「看得见点不到」的老样子。

- **可聚焦**：可点击的元素必须能用 Tab 键到、用 Enter / 空格触发。优先用原生 `<button>`；自绘元素写 `role` 加 `tabindex="0"`，并同时处理 Enter 与空格。**显式写出 `tabindex="0"`**：WebKit（Safari）在 macOS 默认设置下，Tab 只会停在带显式 tabindex 的元素和输入框上，没写 tabindex 的原生按钮也会被跳过。
- **不要再写 `tabindex="-1"` 来绕 lint。** `interactive-supports-focus` 只检查「有没有 tabindex」，写 `-1` 能过 lint，元素却不在 Tab 顺序里，键盘用户到不了它。`-1` 只有三种正当用途，用的地方要在旁边写明：脚本聚焦的容器（窗口、浮层容器）；roving tabindex 的非停靠项（整组只有一个 `tabindex="0"`，方向键移动选择，如 Finder 的条目）；由 `aria-activedescendant` 管理的选项与弹出菜单里的项（聚焦搜索的结果、`MenuList`）。
- **焦点环**用 `:focus-visible`：只在键盘操作时出现，鼠标点击不出现。全局默认样式在 `styles.scss` 的「键盘焦点环」一节（优先级为 0，组件自己写的焦点样式直接覆盖它）；不要用 `:focus` 画环，也不要写 `outline: none` 去掉它而不补替代样式。
- **名称与角色**：图标按钮必须有 `aria-label`；装饰性 SVG 必须 `aria-hidden="true"`（`appIcon` 指令已自带）；自绘部件按 WAI-ARIA 给角色与状态（菜单 `menu` / `menuitem`、开关 `switch` + `aria-checked`、列表 `listbox` / `option`、滑块 `slider`）。窗口是 `role="dialog"`、名称是窗口标题，后台窗口 `aria-hidden`（不用 `inert`：它会让鼠标点后台窗口无法把它调到前台）。
- **浮层**（启动台、聚焦搜索、通知中心、阻断界面）打开时焦点进入浮层、Tab 不漏到下面的桌面、关闭时焦点回到打开它的元素：加 `FocusTrap` 指令（`src/app/shared/focus-trap.ts`）。弹出菜单与面板走 `PopoverService`：键盘打开的传 `focus: true`，`onClose` 带着关闭原因（Esc、Tab、执行命令、点外面……）决定焦点去哪里。盖住整个桌面的东西（锁屏、开机画面、阻断界面）出现时，桌面层整体 `inert`。
- 新增交互界面时，在冒烟的 `a11y` 检查组里补无障碍树（role / name）与纯键盘路径的检查项；本机读屏实测的清单与结论记录表见 [apps/e2e/VOICEOVER.md](apps/e2e/VOICEOVER.md)。

## 需求

- 故事编号 `ADESK-US-XXX`、史诗 `ADESK-EPIC-XXX`，约定见 [requirements/CONVENTIONS.md](requirements/CONVENTIONS.md)。
- 改动可见行为时同步改冒烟（[apps/e2e/src/smoke.mjs](apps/e2e/src/smoke.mjs)），并在故事的验收证据里指向对应检查项。
- 平台能力用 `capabilities: [rxdb:US-XXX]` 引用，不复制根故事。

## 常用命令

在仓库根执行，先切 Node 26：

```bash
pnpm nx dev aiao-desktop                    # 本地开发：开发服务器 http://localhost:4410 + 开发导航 http://127.0.0.1:4412/
pnpm nx run aiao-desktop:verify             # 全部门禁：需求、门禁与开发脚本测试、lint、typecheck、build、冒烟、密钥扫描
pnpm nx serve aiao-desktop-web              # 只起开发服务器 http://localhost:4410（带跨源隔离响应头）
pnpm nx run aiao-desktop-web:serve-static   # 正式构建后在 http://127.0.0.1:4411 预览
pnpm nx run aiao-desktop-e2e:e2e            # 正式构建上的 Chromium 冒烟（按检查组拆分，只跑一组：`node src/smoke.mjs --group=<组名>`，列出组名：`--list`）
pnpm nx run aiao-desktop-e2e:e2e-firefox    # Firefox / WebKit 上的冒烟；确实不能通过的项登记在 apps/e2e/src/baseline/limitations-<引擎>.json（写明档位与原因，通过了的限制算过期）
pnpm nx run aiao-desktop-e2e:e2e-webkit
pnpm nx run aiao-desktop-e2e:verify-saltline   # 本机 Chrome（有 GPU）里的游戏实测，不进 CI
pnpm nx run aiao-desktop-e2e:verify-keyboard   # 本机真实键盘实测（要有人按键），不进 CI
pnpm nx run aiao-desktop:deploy             # 一键发布到 Cloudflare Pages（--dry-run 只检查，--preview 发到 Preview 分支）
```
