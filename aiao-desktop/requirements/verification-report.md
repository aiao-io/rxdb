# Aiao Desktop 验收台账

结构门禁只检查文档契约；门禁脚本测试、构建与浏览器冒烟分别验收。下表的结论来自 2026-11-12 在本分支执行的命令（Node 26.12.0，在仓库根执行）。

## 结构门禁与构建

| 故事与 AC       | 验证层级    | 入口                                                                                                                                       | 当前结论                                                                                                                            |
| --------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| ADESK-US-001 #1 | 文档 / 夹具 | `aiao-desktop:requirements-test`、`aiao-desktop:requirements-check`；[check-requirements.spec.mjs](../scripts/check-requirements.spec.mjs) | 通过：当前目录通过门禁；夹具覆盖 ADESK 前缀、仓库根的平台引用、拒绝 `DESKTOP` 与其他产品前缀、Done 故事的 AC、失效链接              |
| ADESK-US-001 #2 | Nx 项目发现 | `pnpm nx show project aiao-desktop`、`aiao-desktop-web`、`aiao-desktop-e2e`                                                                | 通过：root 分别为 `aiao-desktop`、`aiao-desktop/apps/web`、`aiao-desktop/apps/e2e`，tags 与 targets 可读                            |
| ADESK-US-001 #3 | 检索 / 构建 | `git grep` 旧目录与旧项目名；`aiao-desktop-web:build`                                                                                      | 通过：无残留引用；产物在 `dist/aiao-desktop/apps/web`，初始包 1.09 MB（传输约 256 kB）                                              |
| ADESK-US-001 #4 | 依赖图      | `pnpm nx graph --file=<json>`；检索 e2e 源码的导入                                                                                         | 通过：产品内只有产品根 → web、产品根 → e2e、e2e → web 三条隐式依赖；web 没有产品内依赖；e2e 只导入 Node 内置模块与 `playwright`     |
| ADESK-US-001 #5 | affected    | `pnpm nx show projects --affected --files=<file>`                                                                                          | 通过：改 `aiao-desktop/apps/web/src/main.ts` 列出 web、e2e 与产品根；改 `aiao-desktop/requirements/roadmap.md` 只列产品根           |
| ADESK-US-001 #6 | 安全门禁    | [check-web-secrets.spec.mjs](../scripts/check-web-secrets.spec.mjs)；`aiao-desktop:audit-secrets`                                          | 通过：夹具覆盖五类密钥形状、不回显取值、跳过二进制文件、产物目录缺失时失败；真实产物 10 个文本文件无命中                            |
| ADESK-US-001 #7 | 聚合门禁    | `pnpm nx run aiao-desktop:verify --skip-nx-cache`                                                                                          | 通过：连同依赖共 11 个任务                                                                                                          |
| ADESK-US-001 #8 | CI 接入     | `pnpm nx show projects --withTarget=e2e`（以及 `test`、`audit-secrets`、`lint`、`typecheck`、`build`）；按 CI 测试 lane 的步骤本地复跑     | 通过：e2e 在 `e2e`；产品根在 `test` 与 `audit-secrets`；web 在 `lint`、`typecheck`、`build`；带覆盖率参数跑产品根的 `test` 照常通过 |

## 本地开发入口

| 故事与 AC               | 验证层级                            | 入口                                                                                                                 | 当前结论                                                                                                                                                              |
| ----------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADESK-US-002 #1、#2、#9 | 本机实跑                            | `AIAO_DEV_OPEN=false pnpm nx dev aiao-desktop --output-style=stream`；运行中再跑 `dev-ports`；停止后用 `lsof` 查端口 | 通过：四个任务按序就绪，4410 返回 200，导航页可用；端口检查报出 Web 开发服务器与开发导航两处占用后失败；停止后三个端口全部释放                                        |
| ADESK-US-002 #3～#8     | 浏览器（Chromium 驱动导航页）/ HTTP | 导航页、`/status.json` 与 `serve-static`                                                                             | 通过：两种状态（预览未启动 / 已启动）的徽标正确；复制按钮写入剪贴板；开发服务器上 `crossOriginIsolated` 为 true；403 / 405 / 404 与响应头符合预期；390 宽没有横向滚动 |
| ADESK-US-002 #10        | Node 测试                           | `aiao-desktop:dev-test`（[services.spec.mjs](../scripts/dev/services.spec.mjs) 等 4 个文件）                         | 通过                                                                                                                                                                  |

## 浏览器冒烟

| 故事与 AC           | 验证层级                                                         | 入口                                                             | 当前结论                                                                        |
| ------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| ADESK-US-101 #1～11 | 浏览器：Chromium 无头、正式构建、视口 1440×900、外网请求全部拦截 | `aiao-desktop-e2e:e2e`（[smoke.mjs](../apps/e2e/src/smoke.mjs)） | 通过：输出 JSON 的全部检查项为 true，`unopened` 为空，没有页面错误；冒烟约 26 s |

## 尚未证明

- 非 Chromium 浏览器（Safari、Firefox），以及触屏与移动端尺寸。
- 真实外网下壁纸、地图、天气、Safari 阅读模式与网站图标的显示效果。
- 开机、锁屏与睡眠流程，窗口拖动、缩放与全屏，状态栏面板与控制中心，各应用的内部功能。
- 单元测试与覆盖率：web 没有 `test` 目标，行为只由冒烟覆盖。
- 正式部署与线上环境：产品没有部署目标。
- 无障碍：读屏与只用键盘的完整路径。
