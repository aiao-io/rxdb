# 英文环境支持计划

| 项目 | 内容 |
| --- | --- |
| 状态 | In Progress |
| 创建日期 | 2026-11-22 |
| 目标 | 降低英文开源作者从发现项目到提交贡献的门槛 |
| 影响范围 | 仓库入口、官网、公共 API 文档、i18n runtime、Admin 模板、开发演示应用 |
| 主要约束 | Angular、React、Vue 三端行为和 API 保持对称；既有中文语言选择继续有效 |

## 实施与验收记录

GitHub 的英文 README 和贡献指南直接进入官网 `/en/`。官网根路径继续提供中文文档，两个入口都可以通过导航切换到另一种语言。

| 读者操作 | 已验证的范围 |
| --- | --- |
| 从 GitHub 提问 | Issue 选择页直接提供英文和中文文档链接，英文提问表单进入 `/en/`。仓库脚本检查三个链接的目标。 |
| 按英文文档接入第一个插件 | Chromium 从 Vite 示例加载配套 WASM，在 IndexedDB 中新增、查询、更新和删除 Todo，控制台收到一次插件通知。PGlite 内存库在断开重连前后各保存一个 Todo，每次都只收到一次通知。脚本测试逐字节比对安装页复制的 WASM 和适配器实际依赖。 |
| 在英文浏览器打开 Admin | Angular、React、Vue 共用一套 Chromium 用例。在干净的 `en-US` 环境中检查英文首页、`html[lang]`、标题和 meta description。切换到中文后刷新，再从偏好抽屉清除语言并刷新，两次都检查文案和 metadata。 |
| 打开开发演示的实体页 | 三端 Chromium 都验证了英文新增按钮、规范语言 `en`，以及日期 `October 28, 2026` 和数字 `12,345.67`。 |
| 在 AG Grid 中切换语言 | 三端 Chromium 在实体页写入同一个固定时间的 Todo，进入 AG Grid 后核对英文时间列标题、单元格日期以及 `Yes` / `No` 筛选值。原页切换至中文后再核对中文标题、日期和“是／否”。 |
| 在 Workspace 中恢复和保存草稿 | 三端 Chromium 从英文浏览器创建草稿，核对通知、单数计数和日期，刷新后恢复；切到中文并保存，再切回英文，验证已显示的通知与主表状态更新，草稿标题保持不变。原有中文路由冒烟用例也通过。 |
| 在 Storage 和 OPFS 中管理文件 | 三端 Chromium 验证英文上传、预览、日期和上传反馈，在页面上切换中文后核对格式与文案。OPFS 还校验文件名排序和已打开的删除确认框。原有上传、删除、重命名和覆盖取消流程按各端既有用例验证。 |
| 查看 Todo、文件管理和树菜单的操作历史 | 三端 Chromium 验证历史操作、时间、撤销状态和关闭按钮随语言更新，`time[datetime]` 保留原值。文件管理和树菜单的简单、懒加载和虚拟滚动入口都验证了中英文按钮及侧栏开合。 |
| 从文档复制代码 | 自动检查仓库首页、英文 Getting Started、模型定义、查询、响应式查询、写入、Vite 配置、插件编写、i18n 指南、三端框架指南和首批 12 个公共包 README 中的 TypeScript 示例。Vue 另有测试会实际编译并挂载 `useEntityChange` 的 README 示例。 |
| 从未翻译页面跳到英文指南 | 文档链接以内容目录为根并保留 `.md`。英文单语言构建开启 Markdown、页面和锚点三种断链检查，已核对插件目录正文到编写插件、桌面迁移正文到兼容矩阵的生成链接。 |
| 根据核心报错定位问题 | `packages/rxdb/README.md` 列出 12 个具体错误码、诊断字段及处理方法，含原有小写事务错误码。 |

2026-11-23 已复核 63 个公开包的 101 个 API 入口。`resolveUiLocale` 与 `UiLocale` 已登记在 i18n 基线中。仓库脚本 622 项通过，官网测试 93 项通过，11 组中英文文案键一致。官网和仓库脚本均通过 lint，文档代码检查和需求一致性检查通过。

GitHub 英文 README 直达的安装、兼容矩阵和迁移入口均有英文正文。迁移首页按升级场景说明改动，详细操作仍为中文，并在入口标明。英文文档首页和 Getting Started 直接链接的指南也均有英文正文。官网测试逐一读取这些链接的英文源文件，防止缺少翻译时悄悄展示中文。模型定义、查询、响应式查询和写入示例随仓库脚本进行 TypeScript 编译检查。插件目录注明各插件详细指南的当前语言。英文站严格构建已通过，逐页核对了五个生成页面的英文标题。加密适配器和模型权限两页也能跳到对应的模型指南。

英文 API 索引按任务列出 12 个包的入口。各包 README 的中文镜像链接指向 GitHub 上对应的 `README.zh-CN.md`，生成站点和 npm 包页面都可以使用同一地址。[英文 API 索引](../website/i18n/en/docusaurus-plugin-content-docs/current/api/README.md)

正式双语构建已通过。首次完整构建产出 20,007 个文件，中英文演示共用 `/demo/` 后降至 19,307 个，低于仓库的 Pages 上限 20,000。预览中 `/en/demo/` 下的资源请求保留查询参数并跳转到同一份 JS。三个 `/en/demos/` 宿主都能打开深链接。两份搜索索引分别包含本语言的安装页，英文 API 正文的 12 个包链接均可解析，中英文包页面都提供了中文 README 镜像入口。

本轮加入插件示例和英文迁移索引后，英文严格构建用时 5 分 31 秒。双语正式产物通过 `website:pages-check`，共有 19,308 个文件，最大文件为 10,924,148 字节。已检查两个搜索索引、8 篇英文正文、12 个包的参考链接，以及预览中三个框架的演示深链接。

首轮 `pnpm test-all` 覆盖 99 个受影响项目。在一次并发运行中，5 个看板 PGlite 用例超过默认 5 秒。`rxdb-plugin-board:coverage` 单独按默认配置通过 167 项测试，行覆盖率 97.91%，耗时 3 分 48 秒。全量复跑随后在 `rxdb-plugin-working-tree:test` 和 `rxdb-adapter-electron:test` 停止。工作树插件单独通过全部 1,285 项测试。Electron 适配器单独按默认配置运行时有 1,375 项通过、8 项失败、23 项跳过，包含 PGlite 初始化、备份恢复超时以及 `Article` 重复注册。按原超时配置以 `VITEST_MAX_WORKERS=1` 复跑后，40 个文件全部通过，1,398 项通过、8 项跳过，用时 25 分 20 秒。

三端 Admin、实体页和 AG Grid 的 9 项 Chromium 场景全部通过。三端 Admin 布局测试显式从中文开始，再验证品牌标题切到英文。Angular、React 和 Vue 的 Admin 单测分别通过 132、120 和 144 项。加入 AG Grid 后，全量检查覆盖 100 个项目。看板种子用例把两个 PGlite 连接移到每项测试的准备阶段，仍在测试体内写入种子并比较快照。看板 Node 套件通过 167 项，浏览器通过 6 项，合并后的行覆盖率为 97.90%。SQLite 加载器单独通过 13 项检查，完整 `rxdb-adapter-sqlite:test` 按默认配置通过 842 项，跳过 13 项。

加入 Workspace 前，`pnpm test-all --nxBail=false` 检查了 100 个受影响项目。Angular 开发演示通过 232 项 E2E，含此前超时的 History 建分支；Vue 通过 210 项，三个 Admin 模板各通过 92 项。全量运行只剩两个失败目标：`dev-rxdb-react-e2e:e2e` 在本机默认 8 个 worker 下有 6 项超时；`rxdb-adapter-supabase:test-env` 因 PostgreSQL 容器不健康而退出，依赖它的 `rxdb-adapter-supabase:test` 未运行。

React 的 6 个失败用例按原超时用单 worker 复跑全部通过，随后整套以 2 个 worker 通过 227 项，未更改默认并发或超时。Supabase 的数据库后来报告已接受连接，但 Docker API 和容器健康探针仍有间歇性超时。全量门禁不能据此记为通过。

本轮单独复跑 `rxdb-adapter-supabase:test-env` 成功，数据库初始化和 Kong 健康检查均通过。随后适配器套件通过 38 项重试测试，但 3 项真实 REST 写入用例各在 10 秒超时；直接查询 `todos` 也在约 11 秒后返回 HTTP 500 和 `PGRST002`。已停止本次套件，余下用例未验证。当前阻塞在 PostgREST 加载数据库 schema cache，底层原因尚未确认；没有改适配器、Docker 配置或测试超时。

Workspace 改动通过三端类型检查、8 个相关项目及仓库脚本的零警告 lint，以及 6 项 Chromium 测试。文案审计检查 12 组中英文目录，其中 Workspace 的 60 个键全部匹配。

Storage、OPFS 和 History 共用文件与历史文案目录。文件列表在展示层按当前语言排序，文件操作以原始路径为准。文案审计通过 14 组目录，包括文件的 88 个键和历史的 16 个键。Angular、React 和 Vue 分别验证 14、14 和 15 项 Chromium 用例，包含 History 入口和移动端重命名的单独复跑。Storage 和 OPFS 单测分别通过 106、21 和 8 项。三个演示应用和对应 E2E 项目的类型检查通过，11 个相关项目的 lint 零警告。

本轮 `pnpm test-all` 以 `main` 为基线检查 107 个受影响项目，用时 17 分 40 秒。`dev-rxdb-angular-e2e:e2e` 通过 231 项，移动端重命名测试因仍查找旧按钮文案而失败，同一序列的 5 项未执行。三端都已更新断言并通过重命名复跑。Angular 移动端整组 10 项复跑通过，覆盖之前未执行的 5 项。

全量门禁待通过。独立复跑 `rxdb-adapter-supabase:test-env` 时，PostgreSQL 容器未通过健康检查，Realtime 未能启动。Docker API 健康探测也超时。修正移动端断言后的全量结果仍待验证。

可重复执行的验收命令如下。

```bash
pnpm nx run-many -t e2e -p rxdb-admin-template-angular-e2e,rxdb-admin-template-react-e2e,rxdb-admin-template-vue-e2e --parallel=1 -- --grep=英文浏览器 --workers=1
pnpm nx run-many -t e2e -p dev-rxdb-angular-e2e,dev-rxdb-react-e2e,dev-rxdb-vue-e2e --parallel=1 -- --grep=英文浏览器 --workers=1
pnpm nx run-many -t e2e -p dev-rxdb-angular-e2e,dev-rxdb-react-e2e,dev-rxdb-vue-e2e --parallel=1 --grep='Workspace 草稿恢复|/workspace 能打开' --workers=1
pnpm nx run-many -t e2e -p dev-rxdb-angular-e2e,dev-rxdb-react-e2e,dev-rxdb-vue-e2e --parallel=1 --grep='英文浏览器|Storage Page|OPFS Page|/workspace 能打开|storage 行内重命名' --workers=1
VITEST_MAX_WORKERS=1 pnpm nx run-many -t test -p dev-rxdb-angular,dev-rxdb-react,dev-rxdb-vue --parallel=1 --run -- storage opfs
pnpm nx run @aiao/source:test-scripts
pnpm nx run @aiao/source:audit-i18n
pnpm audit:api-surface
pnpm nx run website:build
pnpm nx run website:site-build -- --locale en --out-dir /tmp/rxdb-english-site
pnpm nx run website:pages-check
pnpm test-all
```

首批包包含核心、Model、Admin、i18n、三端数据库绑定、三端 i18n 绑定、wa-sqlite 和 PGlite。其余适配器、插件和历史页面按使用路径继续翻译。公共 API 的英文说明先交付在 Markdown；包内 JS/TS 注释遵循仓库协作约定。

## 1. 结论

✅ 值得做。

项目已经具备 `@aiao/rxdb-i18n` 以及 Angular、React、Vue 三端绑定，Admin 模板、模型文案和备份页面也已经有中英文目录。当前英文支持的主要缺口集中在公共入口、默认语言探测、日期和数字格式化、官网文档、公共 API 使用说明与运行时错误信息。

本计划先建立一条完整的英文成功路径，再逐步扩大翻译覆盖。英文贡献者应能完成以下动作：

1. 从 GitHub 首页理解项目定位和技术栈。
2. 按英文 README 完成安装、启动和测试。
3. 按英文贡献指南定位代码、运行检查并提交 PR。
4. 在英文浏览器中打开 Admin 模板和开发演示应用时看到一致的英文界面。
5. 从英文官网查到 Getting Started、框架接入、适配器、实体模型、i18n 和贡献流程。
6. 通过稳定的英文公共 API 文档和错误码理解失败原因。

## 2. 实施前审计基线

### 2.1 已有基础

- `packages/rxdb-i18n` 已提供消息目录、locale 规范化、locale chain 和运行时能力。
- `packages/rxdb-i18n-angular`、`packages/rxdb-i18n-react`、`packages/rxdb-i18n-vue` 已有对称的公开 API。
- `packages/rxdb-admin` 已包含 `zh-Hans` 和 `en` 外壳文案目录。
- `packages/rxdb-model/src/messages.ts` 已包含中文和英文模型文案目录。
- Admin 模板三端已经有应用页面、领域模型和备份功能的中英文目录。
- 既有测试已覆盖语言切换、持久化、跨 Tab、页面标题和模型文案。

### 2.2 P0 缺口

| 缺口 | 当前证据 | 影响 |
| --- | --- | --- |
| Admin 模板默认语言固定中文 | `apps/rxdb-admin-template-{react,angular,vue}/src/app/i18n/workbench-i18n.ts` 中 `defaultLocale`、`deviceLocale` 和 `locale` 均固定为 `zh-Hans` | 英文浏览器首次打开仍可能看到中文 |
| 工作台跟随系统时固定回退中文 | `apps/rxdb-admin-template-{react,angular,vue}/src/app/shell/workbench-shell.ts` | 系统语言无法影响工作台 |
| Admin 公共 runtime 固定中文 | `packages/rxdb-admin/src/i18n/index.ts` 的 `createAdminI18n()` 固定使用 `zh-Hans` | 下游应用复用 Admin 包时无法自然跟随英文环境 |
| GitHub 公共入口主要使用中文 | `README.md`、`CONTRIBUTING.md`、`.github/ISSUE_TEMPLATE/`、`.github/PULL_REQUEST_TEMPLATE.md` | 英文作者在进入项目和贡献前遇到语言门槛 |
| 官网只配置 `zh-Hans` | `website/docusaurus.config.ts` 的 `i18n.locales` 只有 `zh-Hans` | 英文作者无法获得完整的官方文档入口 |

### 2.3 P1 缺口

| 缺口 | 重点范围 | 影响 |
| --- | --- | --- |
| 日期时间格式固定 `zh-CN` | `packages/utils/src/file/index.ts`、`apps/dev-rxdb-{react,vue,angular}`、`modules/rxdb-devtools-panel` | 英文文案与中文日期混排 |
| 数字、排序和组件 locale 仍有中文固定值 | 开发演示中的 file sorter、AG Grid 和相关页面 | 英文环境下排序和格式化不一致 |
| 公共 TSDoc 大量中文 | `packages/*` 公共导出和 API 注释 | 自动生成的 API 文档无法服务英文作者 |
| 核心错误信息大量中文 | `packages/rxdb/src/RxDB.ts`、`packages/rxdb/src/entity/entity-value.utils.ts`、`packages/rxdb/src/repository/QueryManager.ts` 及部分适配器 | 英文作者排查问题时缺少稳定英文诊断信息 |
| 文案目录完整性依赖人工检查 | Admin、Model、Application 多套目录 | 新增 key 可能只补中文或只补英文 |

## 3. 语言策略

### 3.1 支持集合

第一阶段固定支持两个 UI locale。

| 规范值 | 输入示例 | 处理方式 |
| --- | --- | --- |
| `en` | `en`、`en-US`、`en-GB` | 归一到英文目录 `en` |
| `zh-Hans` | `zh`、`zh-CN`、`zh-Hans-CN` | 归一到简体中文目录 `zh-Hans` |
| 其他值 | `fr`、空值、无法解析的值 | 回退到 `zh-Hans` |

语言解析顺序固定为以下优先级：

1. 用户显式保存的语言选择。
2. 浏览器或宿主环境语言。
3. 应用默认语言 `zh-Hans`。

用户清除显式选择后恢复跟随浏览器语言。已有保存的 `zh-Hans` 选择继续生效，升级过程不主动修改已有偏好。

### 3.2 一致性要求

- `html[lang]` 使用当前规范化 locale。
- 页面标题、meta description、导航、空状态、错误提示和模型文案使用同一 runtime。
- 日期、时间、数字、相对时间和排序使用当前 locale，除非数据协议明确要求固定格式。
- 数据库字段、实体名、SQL 标识符、迁移名和稳定 API 名称保持原值。
- 翻译缺失时沿用现有 `@aiao/rxdb-i18n` 的 fallback 规则，并在测试中阻止 key 泄漏到最终用户界面。
- 英文公共入口使用英文作为默认阅读语言，中文内容保留可访问的镜像或 locale 路径。

### 3.3 公共文档语言规则

包 README 和官网英文指南面向外部作者，说明公共类型、参数、返回值、错误码和使用示例。`packages` 下 JS/TS 文件的注释和 TSDoc 使用中文。API 名、类型名、代码示例和标准 TSDoc 标签保留原文。维护约定见 [AGENTS.md](../AGENTS.md) 和[中文注释词汇约定](zh-glossary.md)。

## 4. 分阶段实施

### Phase 0 语言合同和文案清单

优先级 P0。先冻结规则，再开始实现。

#### 工作项

- 在 `@aiao/rxdb-i18n` 现有 `canonicalizeLocale`、`buildLocaleChain` 和 runtime 能力上定义统一的 locale 解析入口。
- 明确浏览器语言、显式偏好、默认语言和未知语言的测试矩阵。
- 盘点 Admin、Model、Application 三套目录的 key 集合，生成可重复执行的完整性检查。
- 盘点 `toLocaleString('zh-CN')`、固定 `Intl.*` locale、固定 `localeCompare('zh-CN')` 和组件 locale。
- 明确哪些日期和排序属于协议格式，哪些属于用户界面格式。
- 把包内中文注释和包外英文 API 说明的范围写入贡献指南。

#### 完成条件

- `en` 和 `zh-Hans` 的解析合同有单元测试。
- 三套文案目录的 key 对齐检查有明确入口。
- 所有后续阶段使用同一份 locale 合同，不在框架绑定中各自实现探测逻辑。
- 固定 locale 的清单可定位到文件和符号。

### Phase 1 GitHub 英文贡献入口

优先级 P0。先降低英文作者从仓库首页到第一次贡献的门槛。

#### 文件范围

- `README.md`
- 新增 `README.zh-CN.md`
- `CONTRIBUTING.md`
- 新增 `CONTRIBUTING.zh-CN.md`
- `.github/ISSUE_TEMPLATE/config.yml`
- `.github/ISSUE_TEMPLATE/bug_report.yml`
- `.github/ISSUE_TEMPLATE/feature_request.yml`
- `.github/ISSUE_TEMPLATE/question.yml`
- `.github/PULL_REQUEST_TEMPLATE.md`

#### 内容要求

英文 `README.md` 至少覆盖以下内容：

- 项目定位和适用场景。
- Local-first、响应式查询、统一实体模型与 Angular、React、Vue 支持。
- 安装命令和 Node、pnpm 版本要求。
- 最短运行路径。
- 常用测试命令和 Nx 项目入口。
- 包目录和示例目录导航。
- 文档、问题反馈、贡献指南和行为规范入口。
- 中文 README 镜像链接。

英文 `CONTRIBUTING.md` 至少覆盖以下内容：

- 本地安装和开发环境。
- TDD、TypeScript strict、ESLint 零警告和覆盖率要求。
- Angular、React、Vue 三端对称要求。
- Nx 任务运行方式。
- 变更范围、测试门禁、提交信息和 PR 流程。
- 领域功能与公共包改动的合并治理规则。
- 中文贡献指南镜像链接。

Issue 和 PR 模板改为英文，表单字段保持现有信息密度。模板中保留必要的中文镜像链接，帮助中文贡献者切换阅读。

#### 完成条件

- 没有仓库上下文的英文作者只读英文 README 和贡献指南即可完成安装、启动、测试和提交 Issue。
- README 中的命令在当前工作区实际可执行。
- README、贡献指南、Issue 模板和 PR 模板之间的 Node、pnpm、Nx 命令保持一致。
- 中文镜像内容与英文入口的流程保持同步。

### Phase 2 Admin 模板和运行时英文体验

优先级 P0。三端作为一个交付切片处理。

#### 文件范围

- `apps/rxdb-admin-template-react/src/app/i18n/workbench-i18n.ts`
- `apps/rxdb-admin-template-react/src/app/shell/workbench-shell.ts`
- `apps/rxdb-admin-template-angular/src/app/i18n/workbench-i18n.ts`
- `apps/rxdb-admin-template-angular/src/app/shell/workbench-shell.ts`
- `apps/rxdb-admin-template-vue/src/app/i18n/workbench-i18n.ts`
- `apps/rxdb-admin-template-vue/src/app/shell/workbench-shell.ts`
- `packages/rxdb-admin/src/i18n/index.ts`
- 三端 Admin 模板对应的 i18n、页面标题、meta 和语言偏好测试

#### 实施内容

- 删除 runtime 初始化中无条件写入 `zh-Hans` 的路径。
- 复用统一 locale 解析入口获取浏览器语言和默认回退。
- 保持应用显式传入 locale 的优先级。
- 让工作台语言选择、刷新恢复、跨 Tab 通知和清除偏好行为一致。
- 让 `createAdminI18n()` 的缺省行为与统一语言合同一致，同时保留显式 `locale` 参数。
- 检查 Angular 的 locale data 注册，确保日期和数字格式化不依赖中文模块的偶然加载。
- 校验 Admin、Model、Application 三套目录的英文 key 完整性。

#### 完成条件

- 英文浏览器首次打开 React、Angular、Vue Admin 模板显示英文。
- 中文浏览器首次打开显示简体中文。
- 已保存语言优先于浏览器语言。
- 清除保存语言后恢复跟随浏览器语言。
- 三端 `html[lang]`、页面标题和 meta description 一致。
- 三端对同一 locale 输入得到相同的 key 解析结果。

### Phase 3 日期、数字、排序和组件 locale

优先级 P1。修复英文文案与中文格式混排的问题。

#### 文件范围

- `packages/utils/src/file/index.ts`
- `apps/dev-rxdb-react/src/app/pages/workspace.tsx`
- `apps/dev-rxdb-react/src/app/components/HistorySidebar.tsx`
- `apps/dev-rxdb-react/src/app/pages/storage/components/StorageFileList.tsx`
- `apps/dev-rxdb-react/src/app/pages/opfs/utils/opfs-utils.ts`
- `apps/dev-rxdb-vue/src/pages/WorkspacePage.vue`
- `apps/dev-rxdb-vue/src/pages/opfs/utils/opfs-utils.ts`
- `apps/dev-rxdb-vue/src/pages/storage/utils/storage-utils.ts`
- `apps/dev-rxdb-angular/src/app/pages/storage/components/storage-file-list.component.ts`
- `apps/dev-rxdb-angular/src/app/pages/workspace/workspace.page.ts`
- `apps/dev-rxdb-angular/src/app/pages/opfs/components/opfs-file-list.component.ts`
- `modules/rxdb-devtools-panel/src/pages/opfs-page.utils.ts`
- 三端开发应用中的 file sorter、AG Grid 和其他固定组件 locale

#### 实施内容

- 将用户可见格式化函数改为接收当前 locale，默认值只作为独立调用方的安全回退。
- 优先复用现有 i18n runtime 和平台 `Intl.*`，不引入第二套格式化库。
- 对文件名、扩展名和历史记录排序区分用户界面排序与协议排序。
- 只迁移确认属于用户界面的固定 `zh-CN`，协议字段和需要稳定输出的序列化格式保持原合同。
- Angular、React、Vue 对同一日期、数字和排序场景使用一致的 locale 输入。

#### 完成条件

- 英文界面中的日期、数字、相对时间和组件 locale 不再无条件使用中文。
- 中文界面保留现有用户可见格式。
- 需要固定输出的文件名、数据库字段和序列化值没有被语言设置改变。
- 三端各有至少一个英文和中文格式化回归测试。

### Phase 4 官网英文站点

优先级 P0。建立英文作者的官方文档最短路径。

#### 文件范围

- `website/docusaurus.config.ts`
- `website/sidebars.ts`
- `website/docs/`
- `website/src/pages/`
- `website/i18n/`
- 官网搜索、metadata、导航和 footer 配置

#### 实施内容

- 配置 `en` 与 `zh-Hans` 两个 locale。
- 官网根路径继续提供中文。GitHub 的英文 README 和贡献指南指向 `/en/`。
- 翻译首页、Getting Started、Install、Frameworks、Entity Model、Adapters、Plugin Authoring、I18n、Compatibility 和 Contributing。
- 翻译导航、footer、页面标题、meta description、搜索提示和错误页面。
- 保持代码示例、包名、API 名和命令可复制执行。
- 检查内部链接、跨语言链接、编辑链接、搜索索引和生成的文档路径。
- 旧中文 URL 在迁移前建立兼容策略，避免已有分享链接直接失效。

#### 完成条件

- 英文首页可以进入最短成功路径，并在三次以内到达安装和第一个示例。
- 英文 Getting Started、框架接入和贡献文档无断链。
- 中英文导航结构和核心文档层级对齐。
- `website` 的构建和链接检查通过。
- 英文站点的 title、description 和 `html[lang]` 正确。

历史文档、博客和完整 API 页面可以在最短成功路径稳定后继续分批迁移。核心入口先完成，避免翻译范围失控。

### Phase 5 公共包 README 与 API 指南

优先级 P1。让英文作者能从包入口理解 API 边界和用法。

#### 推荐顺序

1. `@aiao/rxdb`
2. `@aiao/rxdb-model`
3. `@aiao/rxdb-i18n`
4. `@aiao/rxdb-admin`
5. `@aiao/rxdb-angular`、`@aiao/rxdb-react`、`@aiao/rxdb-vue`
6. 适配器包
7. 核心插件和三端绑定包

#### 实施内容

- 公共包 README 使用英文，并提供中文镜像或中文文档链接。
- 在英文 README 和官网指南中说明公共导出、参数、返回值、异常和生命周期。
- 生成的 API 页面与包 README 使用相同术语。
- 示例覆盖安装、初始化、查询、实体模型、框架绑定和错误处理。
- 不重命名现有导出，不改变参数类型，不借翻译清理引入破坏性 API 变化。
- 对 public API baseline 相关包执行现有 API 门禁。

#### 完成条件

- 主要公共包的入口页面可以独立解释安装、核心概念和最小用法。
- 英文 API 入口可以找到已翻译包的使用说明和公共签名。
- 英文 Markdown 中的示例可在当前仓库或对应 demo 中验证。
- API baseline、类型检查、lint 和包测试通过。

### Phase 6 稳定错误码和英文诊断

优先级 P1。把错误识别从不稳定的自然语言字符串中分离出来。

#### 首批文件范围

- `packages/rxdb/src/RxDB.ts`
- `packages/rxdb/src/entity/entity-value.utils.ts`
- `packages/rxdb/src/repository/QueryManager.ts`
- 适配器和插件中面向调用方抛出的中文错误

#### 实施内容

- 为公共错误增加稳定 `code`。
- 对需要机器处理的错误增加结构化 `details`。
- 默认诊断信息使用清晰英文，UI 层根据 `code` 使用当前 locale 翻译。
- 保持错误类型、抛出时机、可重试语义和现有调用约定。
- 先追加 code 和结构化上下文，再逐组迁移 message，避免一次性改动所有错误文本。
- 为关键错误建立错误码清单、英文说明和中文界面映射。

`RxDBMissingPluginError` 已提供 `RXDB_PLUGIN_MISSING`。调用方可以读取 `entity`、`packageName` 和 `registration`，定位缺少注册的实体和插件。完整清单见[核心包 README](../packages/rxdb/README.md#public-contracts)。

#### 完成条件

- 核心公共错误可以通过 `code` 稳定识别。
- 英文作者从默认错误信息可以理解修复方向。
- 应用 UI 不依赖错误 message 的中文或英文全文匹配。
- 既有错误类型和可观测行为有回归测试。

## 5. 三框架对称要求

Admin 模板、开发演示和公共绑定包均按 Angular、React、Vue 同步交付。单端完成不能关闭对应任务。

| 能力 | Angular | React | Vue |
| --- | --- | --- | --- |
| 默认 locale 解析 | 模板 runtime、shell、测试 | 模板 runtime、shell、测试 | 模板 runtime、shell、测试 |
| 显式语言选择 | 选择、持久化、清除 | 选择、持久化、清除 | 选择、持久化、清除 |
| 页面元数据 | title、description、`html[lang]` | title、description、`html[lang]` | title、description、`html[lang]` |
| Admin 文案 | 应用、模型、备份 | 应用、模型、备份 | 应用、模型、备份 |
| 日期和数字 | 页面、文件、OPFS | 页面、文件、OPFS | 页面、文件、OPFS |
| 测试 | unit、browser 或 E2E | unit、browser 或 E2E | unit、browser 或 E2E |

共享逻辑放入框架无关包。框架层只负责生命周期、信号或响应式订阅、DOM 元数据和框架需要的 locale 注册。

## 6. 测试与验收

### 6.1 TDD 顺序

每个实现切片先补失败测试，再实现，再重构。测试范围覆盖共享核心、公共包、三端绑定、模板和真实浏览器入口。

### 6.2 必测场景

| 编号 | 验收场景 |
| --- | --- |
| EN-AC-01 | 英文浏览器首次打开 Admin React、Angular、Vue 模板显示英文 |
| EN-AC-02 | 中文浏览器首次打开三个模板显示简体中文 |
| EN-AC-03 | 已保存语言优先于浏览器语言 |
| EN-AC-04 | 清除已保存语言后恢复跟随浏览器语言 |
| EN-AC-05 | 三端 `html[lang]`、页面标题和 meta description 与当前语言一致 |
| EN-AC-06 | 日期、数字、相对时间和用户界面排序使用当前语言 |
| EN-AC-07 | Admin、Model、Application 文案目录 key 集合对齐 |
| EN-AC-08 | 缺失 key 不直接泄漏到用户界面，且检查能定位缺失目录 |
| EN-AC-09 | 英文 README 可完成安装、运行、测试和提交 Issue |
| EN-AC-10 | 英文官网核心路径无断链，构建和搜索索引通过 |
| EN-AC-11 | 首批包有英文 API 指南，示例可验证，API baseline 通过 |
| EN-AC-12 | 核心错误具备稳定 code，应用层不依赖 message 全文匹配 |
| EN-AC-13 | 英文和中文用户已有显式语言偏好在升级后保持原值 |

### 6.3 Nx 验证入口

实际项目名和 target 以工作区配置为准，所有任务通过 `pnpm nx` 执行。

- `pnpm nx test rxdb-i18n --run`
- 运行 `rxdb-admin`、三个 Admin 模板、三个开发演示和官网对应的 test、build、lint target。
- 对浏览器行为运行已有 browser 或 E2E target，覆盖真实 `navigator.language` 和页面 metadata。
- 运行英文文案目录 key 检查和文档链接检查。
- 完成所有切片后运行 `pnpm test-all`。
- 最终执行 `git diff --check`，并确认没有因为翻译产生格式化噪声或无关文件。

## 7. 推荐交付顺序

1. 确认语言解析顺序、目录完整性检查和英文 API 说明的位置。
2. 先补 `rxdb-i18n` 与 Admin runtime 的红测试。
3. 同一交付切片完成 React、Angular、Vue Admin 模板默认语言和偏好行为。
4. 完成 GitHub 英文入口，让外部作者可以开始使用和反馈。
5. 完成开发演示中的日期、数字、排序和组件 locale。
6. 配置英文官网并翻译最短成功路径。
7. 翻译公共包 README 和官网 API 指南。
8. 增加错误码和英文诊断，配套 UI 翻译。
9. 执行 affected 检查、覆盖率检查、API 门禁和完整测试。

### 7.1 建议的变更切片

| 切片 | 内容 | 评审重点 |
| --- | --- | --- |
| A | 语言合同、检查脚本、规范更新 | locale 解析和规则边界 |
| B | Admin runtime 与三端模板 | 三框架对称、偏好兼容、真实浏览器行为 |
| C | GitHub 英文入口 | 命令可执行、链接有效、中文镜像同步 |
| D | 开发演示格式化 | 用户界面格式与协议格式边界 |
| E | 官网英文 locale | 文档层级、链接、URL 兼容、搜索索引 |
| F | 公共包 README、API 指南和错误码 | API 稳定性、英文诊断、公共文档质量 |

涉及 `packages/*` 公共包和三端应用的切片需要在同一变更范围内统一评审和验证。每个切片合入前都应通过对应 target，最终由 affected 和完整门禁收口。

## 8. 风险与处理

| 风险 | 处理方式 |
| --- | --- |
| locale 探测在 SSR、Node、Electron 或 Tauri 中缺少浏览器 API | 复用框架无关的显式输入，运行时探测由宿主适配层提供，增加各宿主冒烟测试 |
| 英文目录漏 key | 在测试和 CI 中比较目录 key 集合，禁止只依赖人工检查 |
| Angular locale data 未加载 | 把英文和中文格式化场景加入 Angular 实际运行测试 |
| 官网默认语言变化导致旧中文链接失效 | 先盘点现有 URL，再保留中文 locale 路径或增加兼容跳转 |
| `localeCompare` 改动影响稳定排序 | 先区分协议排序和用户界面排序，只迁移有明确用户语言语义的场景 |
| 错误 message 变化影响下游断言 | 先增加稳定 `code`，保留错误类型和语义，分组迁移 message 并补迁移说明 |
| 翻译扩大范围造成长期维护负担 | 先完成英文作者最短路径，再按包和文档层级逐步扩展 |

## 9. 范围外事项

本计划暂不包含以下事项：

- 一次性翻译全部 `requirements/`、测试说明和测试夹具。
- 重命名公共 API、包名、数据库字段、实体名、SQL 标识符或迁移名。
- 引入第二套 i18n 状态管理或消息格式化库。
- 把所有固定 `localeCompare('zh-CN')` 无差别替换成动态 locale。
- 改变已有中文用户的持久化语言选择。
- 在没有真实运行时验证的情况下宣称小程序、Electron、Tauri 和 Web 完全等价。
- 将领域功能和公共包改动拆成绕过统一评审的独立合并路径。

## 10. 已采用的决策与后续范围

- 官网 `/` 为中文，`/en/` 为英文。中英文首页、安装页和各自的搜索索引纳入 Pages 发布检查。
- 公共包的英文说明写入 Markdown，源码注释遵循 `AGENTS.md`。
- Admin、演示实体页、AG Grid、Workspace、Storage、OPFS 和 History 已完成三框架英文浏览器验收。DevTools 面板使用浏览器语言格式化文件日期，面板文案和其余演示页的专属操作文案仍待补齐。
- 核心 README 已记录 12 个错误码。涉及既有异常消息的改动按错误类型单独评审。
- 本地和 CI 都通过 `pnpm nx run @aiao/source:audit-i18n` 检查文案键。

## 11. 完成定义

满足以下条件后，本计划对应的英文环境支持可以进入交付验收：

- 英文作者可以从 GitHub 公共入口完成安装、启动、测试和贡献。
- 官网英文最短成功路径可用，核心链接、搜索和 metadata 正确。
- 英文浏览器首次进入 Admin 模板和目标开发演示时得到一致英文体验。
- 中文用户已有语言偏好和中文入口继续有效。
- Angular、React、Vue 三端行为、文案 key 和公开 API 保持对称。
- 公共 API 文档、错误码和示例足以支持英文问题定位。
- 相关单测、浏览器测试、lint、类型检查、API 门禁、覆盖率和最终 Nx 门禁通过。
