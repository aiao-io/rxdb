# Aiao Desktop 验收台账

结构门禁只检查文档契约；门禁脚本测试、构建与浏览器冒烟分别验收。下表的结论来自 2026-11-12 在本分支执行的命令（Node 26.12.0，在仓库根执行）；ADESK-US-102、应用体系与集成应用（ADESK-US-201～203）以及重跑的聚合门禁来自 2026-11-13。

## 结构门禁与构建

| 故事与 AC       | 验证层级    | 入口                                                                                                                                       | 当前结论                                                                                                                            |
| --------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| ADESK-US-001 #1 | 文档 / 夹具 | `aiao-desktop:requirements-test`、`aiao-desktop:requirements-check`；[check-requirements.spec.mjs](../scripts/check-requirements.spec.mjs) | 通过：当前目录通过门禁；夹具覆盖 ADESK 前缀、仓库根的平台引用、拒绝 `DESKTOP` 与其他产品前缀、Done 故事的 AC、失效链接              |
| ADESK-US-001 #2 | Nx 项目发现 | `pnpm nx show project aiao-desktop`、`aiao-desktop-web`、`aiao-desktop-e2e`                                                                | 通过：root 分别为 `aiao-desktop`、`aiao-desktop/apps/web`、`aiao-desktop/apps/e2e`，tags 与 targets 可读                            |
| ADESK-US-001 #3 | 检索 / 构建 | `git grep` 旧目录与旧项目名；`aiao-desktop-web:build`                                                                                      | 通过：无残留引用；产物在 `dist/aiao-desktop/apps/web`，初始包 1.09 MB（传输约 256 kB）                                              |
| ADESK-US-001 #4 | 依赖图      | `pnpm nx graph --file=<json>`；检索 e2e 源码的导入                                                                                         | 通过：产品内只有产品根 → web、产品根 → e2e、e2e → web 三条隐式依赖；web 没有产品内依赖；e2e 只导入 Node 内置模块与 `playwright`     |
| ADESK-US-001 #5 | affected    | `pnpm nx show projects --affected --files=<file>`                                                                                          | 通过：改 `aiao-desktop/apps/web/src/main.ts` 列出 web、e2e 与产品根；改 `aiao-desktop/requirements/roadmap.md` 只列产品根           |
| ADESK-US-001 #6 | 安全门禁    | [check-web-secrets.spec.mjs](../scripts/check-web-secrets.spec.mjs)；`aiao-desktop:audit-secrets`                                          | 通过：夹具覆盖五类密钥形状、不回显取值、跳过二进制文件、产物目录缺失时失败；真实产物 10 个文本文件无命中                            |
| ADESK-US-001 #7 | 聚合门禁    | `pnpm nx run aiao-desktop:verify --skip-nx-cache`                                                                                          | 通过：2026-11-13 连同依赖共 51 个任务（web 引入平台包后多了上游的类型检查与构建），约 74 s                                          |
| ADESK-US-001 #8 | CI 接入     | `pnpm nx show projects --withTarget=e2e`（以及 `test`、`audit-secrets`、`lint`、`typecheck`、`build`）；按 CI 测试 lane 的步骤本地复跑     | 通过：e2e 在 `e2e`；产品根在 `test` 与 `audit-secrets`；web 在 `lint`、`typecheck`、`build`；带覆盖率参数跑产品根的 `test` 照常通过 |

## 本地开发入口

| 故事与 AC               | 验证层级                            | 入口                                                                                                                 | 当前结论                                                                                                                                                              |
| ----------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADESK-US-002 #1、#2、#9 | 本机实跑                            | `AIAO_DEV_OPEN=false pnpm nx dev aiao-desktop --output-style=stream`；运行中再跑 `dev-ports`；停止后用 `lsof` 查端口 | 通过：四个任务按序就绪，4410 返回 200，导航页可用；端口检查报出 Web 开发服务器与开发导航两处占用后失败；停止后三个端口全部释放                                        |
| ADESK-US-002 #3～#8     | 浏览器（Chromium 驱动导航页）/ HTTP | 导航页、`/status.json` 与 `serve-static`                                                                             | 通过：两种状态（预览未启动 / 已启动）的徽标正确；复制按钮写入剪贴板；开发服务器上 `crossOriginIsolated` 为 true；403 / 405 / 404 与响应头符合预期；390 宽没有横向滚动 |
| ADESK-US-002 #10        | Node 测试                           | `aiao-desktop:dev-test`（[services.spec.mjs](../scripts/dev/services.spec.mjs) 等 4 个文件）                         | 通过                                                                                                                                                                  |

## 单元测试

| 故事与 AC    | 验证层级  | 入口                                                      | 当前结论                                                                                                                                                                                                                                                                                                   |
| ------------ | --------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADESK-US-102 | Node 单测 | `aiao-desktop-web:test`（`vitest.config.mts`，Node 环境） | 通过：22 个文件、161 个用例。覆盖路径与种类、目录树组装、内置磁盘与文件格式（PDF 读回、WAV、占位文件头、Info.plist）、卷的首次复制 / 保留 / 抹掉、终端同步的差异与双向同步（内存磁盘加假虚拟机）、对已安装 `@vivari/core` 的 sh 打补丁后在宿主 Node 上实跑、补充命令在临时目录里实跑，以及各应用的数据转换 |

## 浏览器冒烟

| 故事与 AC           | 验证层级                                                                      | 入口                                                             | 当前结论                                                                                             |
| ------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| ADESK-US-101 #1～11 | 浏览器：Chromium 无头、正式构建、视口 1440×900、外网请求全部拦截              | `aiao-desktop-e2e:e2e`（[smoke.mjs](../apps/e2e/src/smoke.mjs)） | 通过：输出 JSON 的全部检查项为 true，`unopened` 为空，没有页面错误；冒烟约 26 s                      |
| ADESK-US-102 #1～14 | 浏览器：同上，全新浏览器配置（OPFS 为空，首次打开写入内置内容），中途刷新一次 | `aiao-desktop-e2e:e2e`（同一个脚本，接在 US-101 的检查之后）     | 通过（2026-11-13）：`diskState` 13 项与 `persistence` 6 项全部为 true，没有页面错误；整份冒烟约 43 s |

## 应用体系与集成应用

| 故事与 AC                                 | 验证层级                                                                                  | 入口                                                                                                  | 当前结论                                                                                                                                                                                                                                         |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ADESK-US-201 #1～#3                       | Node 单测                                                                                 | `aiao-desktop-web:test`（[desktop-apps.spec.ts](../apps/web/src/app/services/desktop-apps.spec.ts)）  | 通过：真实登记表合规（2 个系统入口、30 个内置应用、1 个集成应用）；14 种不合规登记逐项报出应用与字段；允许来源只有 `https://vscode.aiao.io`。web 单测共 24 个文件、167 个用例                                                                    |
| ADESK-US-202 #9（其余失败原因）           | Node 单测                                                                                 | [web-app-failure.spec.ts](../apps/web/src/app/apps/web-app/web-app-failure.spec.ts)                   | 通过：加载失败、超时、应用自报、整页导航与其他错误的文案；只有运行中的失败交给窗口显示                                                                                                                                                           |
| Orbit 的 `focus()` 与加载后未握手即失败   | 浏览器单测（Chromium）                                                                    | `orbit:test`（[runtime.browser.spec.ts](../../packages/orbit/src/__tests__/runtime.browser.spec.ts)） | 通过：5 个文件、46 个用例；入口 404 时 3 秒宽限后以 `LOAD_ERROR` 失败，不等 60 秒就绪时限                                                                                                                                                        |
| ADESK-US-201 #4～#7、ADESK-US-202 #1～#10 | 浏览器冒烟：Chromium 无头、正式构建、外网全部拦截，替身应用顶替 `https://vscode.aiao.io/` | `aiao-desktop-e2e:e2e`（[smoke.mjs](../apps/e2e/src/smoke.mjs) 的 `integratedApp` 检查组）            | 通过：`integratedApp` 25 项全部为 true，`everyAppOpens` 的 `unopened` 为空，没有页面错误；整份冒烟约 60 s。缩放检查做过反证：不给 iframe 设 `pointer-events: none`，指针一进 iframe 就丢了跟踪                                                   |
| ADESK-US-203 #1～#6                       | 浏览器（Chromium 无头）、桌面正式构建、真实网络                                           | `aiao-desktop-e2e:verify-aiao-code`（[verify-aiao-code.mjs](../apps/e2e/src/verify-aiao-code.mjs)）   | 发布前：`--vscode-dist` 指向带握手与 CORP 的本地产物，6 项全过（就绪 0.4 s，WebContainer 终端 6.6 s 运行，重开 0.9 s）。对现在的线上版本跑：窗口显示「vscode.aiao.io didn’t connect」，与线上缺 CORP 的实测一致。线上验收待 Aiao Code 发布后重跑 |

## 尚未证明

- 非 Chromium 浏览器（Safari、Firefox），以及触屏与移动端尺寸。
- 真实外网下壁纸、地图、天气、Safari 阅读模式与网站图标的显示效果。
- 开机、锁屏与睡眠流程，窗口拖动、缩放与全屏，状态栏面板与控制中心，各应用的内部功能。
- 覆盖率：web 的单测没有接入覆盖率门槛（门槛只管 `packages/` 下的公开包），界面组件只由冒烟覆盖。
- 已有库的升级路径：冒烟每次都从空的 OPFS 开始；在旧版本建的库上补建新表、补写新数据域的种子，没有在浏览器里实跑过（子 agent 的 Node 探针覆盖过）。
- 多个标签页同时打开：同一个库在两个标签页里各有一份内存索引与一台虚拟机，彼此的改动刷新后才看得到。
- 正式部署与线上环境：产品没有部署目标。
- Aiao Code 的线上验收（ADESK-US-203）：要等 Aiao Code 带着握手与 CORP 发布到 vscode.aiao.io。
- 集成应用在 aiao.io 之外的站点下的存储分区：桌面里的 Aiao Code 与直接访问看到的是两份项目，只按浏览器规则推断，没有对比实测。
- 无障碍：读屏与只用键盘的完整路径。
