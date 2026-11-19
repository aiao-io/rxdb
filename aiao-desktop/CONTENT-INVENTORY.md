# Aiao Desktop 内容架构盘点

盘点日期为 2026-11-19。依据当前工作区源码、Nx 项目配置和仓库验收记录。应用按主要用户流程归类，带有初始示例数据的应用仍按它实际能完成的任务判断。[产品约定](AGENTS.md) · [内置应用验收台账](requirements/plans/2026-11-17-builtin-workflows.md)

## 应用数量与入口

- **34 条固定登记**。31 个内置应用、1 个远程集成应用 Aiao Code、2 个系统入口 Launchpad 和 Trash。32 个应用可从启动台和聚焦搜索启动，其中 30 个是 Angular 组件应用、1 个是同源 HTML 游戏、1 个是远程 Web 应用。[应用清单](apps/web/src/app/apps/app-manifests.ts) · [运行来源与启动顺序](apps/web/src/app/services/desktop-apps.ts)
- **30 个 `/Applications` 应用包**。Finder 和 About This Mac 与两个系统入口均在该目录之外。`about` 的清单显示名也是 `Finder`，因此在启动台看到两个同名条目时可用 ID 区分。首次使用时 Dock 固定 15 项，其中 Trash 单独位于分隔线之后。[应用清单](apps/web/src/app/apps/app-manifests.ts) · [Applications 验收](apps/e2e/src/groups/applications.mjs)
- **5 个以演示或模拟为主的应用**。Podcasts、TV、Books 展示预置内容。FaceTime 模拟通话，Voice Memos 模拟播放界面。另有 3 个样例驱动的交互应用、23 个具备实际用途的应用，以及 1 个随产品发布的可玩游戏。[组件绑定](apps/web/src/app/apps/registry.ts) · [内置应用验收台账](requirements/plans/2026-11-17-builtin-workflows.md)
- **0 个可选应用版本**。当前随构建发布的批准目录为空。App Store 的安装、更新、回滚和卸载流程已经实现，安装后才会将 `catalog:*` 条目并入运行时登记表。上面的数量按固定清单统计。[正式目录](apps/web/public/approved-apps.json) · [运行时登记表](apps/web/src/app/services/application-registry.ts) · [批准目录验收](requirements/stories/application/ADESK-US-207-approved-app-catalog.md)

## 目录结构

```text
aiao-desktop/
├── AGENTS.md、README.md、CONTENT-INVENTORY.md
├── project.json                # Nx 项目 aiao-desktop，开发、发布、需求与聚合门禁
├── apps/
│   ├── web/                    # aiao-desktop-web，唯一面向用户部署的应用
│   │   ├── project.json、ngsw-config.json、tsconfig*.json、vitest.config.mts
│   │   ├── public/             # 随构建复制的 PWA、壁纸、托管配置、批准目录、OAuth 回调、游戏
│   │   ├── tools/              # 正式构建预览与 PWA 图标生成
│   │   └── src/
│   │       ├── main.ts、index.html、styles.scss
│   │       └── app/
│   │           ├── pages/      # 桌面页、服务装配与启动
│   │           ├── components/ # 外壳、窗口、菜单栏、Dock、浮层和小组件
│   │           ├── apps/       # app-manifests.ts、registry.ts、应用与远程窗口容器
│   │           ├── services/   # 窗口、应用生命周期、系统状态、Orbit、文件与跨页协调
│   │           ├── data/       # RxDB 装配、实体/种子汇总、迁移、备份恢复与偏好
│   │           ├── disk/       # 虚拟文件系统、Applications 投影、出厂样例与文件格式
│   │           ├── vm/         # Vivari 虚拟机、终端运行资源与磁盘桥接
│   │           ├── shared/     # 图标、焦点、外部来源清单等共用代码
│   │           └── testing/    # Web 单测辅助与替身，单测主要随源码放置
│   └── e2e/                    # aiao-desktop-e2e，对正式产物跑 Playwright 验收
│       ├── project.json、VOICEOVER.md
│       └── src/
│           ├── smoke.mjs      # 冒烟入口
│           ├── groups/        # 按用户流程组织的检查组
│           ├── harness/       # 会话、断言、请求替身与产物检查
│           ├── fixtures/      # 批准目录、运行时包、旧库和浏览器等夹具
│           ├── baseline/      # 检查项基线、Firefox/WebKit 限制
│           └── verify-*.mjs   # Aiao Code、域名、键盘和游戏的独立验收
├── requirements/              # ADESK 需求、决策、验收台账和证据
│   ├── stories/、epics/、plans/、reviews/、evidence/、code-scanning/
│   └── README.md、decisions.md、verification-report.md 等
└── scripts/
    ├── dev/                    # 固定端口、本地开发导航
    ├── deploy/                 # Cloudflare Pages 发布与产物检查
    ├── vivari/                 # 构建时准备终端的同源资源
    └── check-*.mjs             # 需求与密钥门禁
```

`aiao-desktop` 是产品聚合项目。`apps/web` 构建到仓库的 `dist/aiao-desktop/apps/web`，`apps/e2e` 从产物侧验收。数据由仓库根的 `@aiao/rxdb` 等平台包提供，集成协议由 `@aiao/orbit` 提供。Aiao Code 源码在仓库的 `apps/aiao-vscode/`，本产品通过已登记的远程地址加载它。`apps/web-desktop/` 是单独的 Web Desktop 产品。[依赖方向](AGENTS.md#依赖方向) · [产品拆分决策](requirements/decisions.md#d-02产品根目录与应用拆分)

`apps/web/src/app/apps/` 有 30 个子目录。`shelf/` 共用一个组件承载 Podcasts、TV、Books 三个 ID，`web-app/` 承载 Aiao Code 和将来安装的远程应用。Launchpad 与 Trash 在桌面外壳处理。[组件绑定](apps/web/src/app/apps/registry.ts) · [运行时登记表](apps/web/src/app/services/application-registry.ts) · [系统入口](apps/web/src/app/services/app-launcher.ts)

## 实际功能应用（23）

| ID           | 应用             | 已有能力和范围                                                                                                   | 入口或验收                                                                                                                                                 |
| ------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `finder`     | Finder           | 管理桌面虚拟磁盘。目录导航、搜索、导入导出、重命名、移动、废纸篓恢复与按文件类型打开。文件体存浏览器 OPFS。      | [源码](apps/web/src/app/apps/finder/finder.ts) · [文件管理](apps/e2e/src/groups/file-management.mjs)                                                       |
| `terminal`   | Terminal         | xterm 界面与 Vivari 浏览器虚拟机，可运行 Node、Bun、Python、SQLite 等，与 Finder 对同一虚拟磁盘读写。            | [源码](apps/web/src/app/apps/terminal/terminal.ts) · [运行时验收](apps/e2e/src/groups/terminal-runtimes.mjs)                                               |
| `textedit`   | TextEdit         | 文本编辑、保存和另存，处理文件版本冲突及关闭前的未保存改动。                                                     | [源码](apps/web/src/app/apps/textedit/textedit.ts) · [文档流程](apps/e2e/src/groups/document-workflow.mjs)                                                 |
| `preview`    | Preview          | 从磁盘读图片和受支持的文本 PDF，支持复制、打印等内容操作。MP4/MOV 显示视频占位界面。                             | [源码](apps/web/src/app/apps/preview/preview.ts) · [内容操作](apps/e2e/src/groups/content-actions.mjs)                                                     |
| `diskutil`   | Disk Utility     | 查看虚拟卷与存储健康、抹掉卷、导出完整备份并从备份恢复。                                                         | [源码](apps/web/src/app/apps/disk-utility/disk-utility.ts) · [备份与恢复](apps/e2e/src/groups/backup-storage.mjs)                                          |
| `activity`   | Activity Monitor | 读取已打开的桌面窗口、应用运行及资源状态。观察范围是当前桌面实例。                                               | [源码](apps/web/src/app/apps/activity-monitor/activity-monitor.ts) · [运行状态](apps/e2e/src/groups/runtime-activity.mjs)                                  |
| `settings`   | System Settings  | 分区搜索、主题、壁纸与 Dock 等桌面配置。Wi‑Fi、蓝牙等面板读写桌面状态并展示预置列表。                            | [源码](apps/web/src/app/apps/settings/settings.ts) · [面板](apps/web/src/app/apps/settings/panes/) · [设置流程](apps/e2e/src/groups/settings-workflow.mjs) |
| `about`      | About This Mac   | 浏览器桌面简介与实际外部内容来源、用途和触发方式说明。                                                           | [源码](apps/web/src/app/apps/about/about.ts) · [外部内容](apps/e2e/src/groups/external-content.mjs)                                                        |
| `calculator` | Calculator       | 基本运算、百分比与键盘输入。计算范围是基础模式。                                                                 | [计算引擎](apps/web/src/app/apps/calculator/calculator-engine.ts)                                                                                          |
| `clock`      | Clock            | 根据当前时间与预置偏移更新世界时钟。城市来自初始清单。                                                           | [源码](apps/web/src/app/apps/clock/clock.ts)                                                                                                               |
| `notes`      | Notes            | 本地笔记和文件夹、搜索、保存、复制、置顶。编辑失败和冲突时保留内容。                                             | [源码](apps/web/src/app/apps/notes/notes.ts) · [草稿验收](apps/e2e/src/groups/note-drafts.mjs) · [文件夹验收](apps/e2e/src/groups/notes-folders.mjs)       |
| `calendar`   | Calendar         | 本地日历视图、事件增删改、草稿与并发冲突保护。范围限当前浏览器的日历数据。                                       | [源码](apps/web/src/app/apps/calendar/calendar.ts) · [事件草稿](apps/e2e/src/groups/calendar-drafts.mjs)                                                   |
| `reminders`  | Reminders        | 本地提醒事项编辑、完成、标旗、动态筛选与保存失败保护。                                                           | [源码](apps/web/src/app/apps/reminders/reminders.ts) · [列表筛选](apps/e2e/src/groups/reminder-filters.mjs)                                                |
| `contacts`   | Contacts         | 本地联系人搜索、新建、编辑、删除与失败提示。                                                                     | [源码](apps/web/src/app/apps/contacts/contacts.ts) · [联系人流程](apps/e2e/src/groups/contacts.mjs)                                                        |
| `freeform`   | Freeform         | 画笔、颜色、清空以及笔迹写入 SQLite。                                                                            | [源码](apps/web/src/app/apps/freeform/freeform.ts) · [笔迹流程](apps/e2e/src/groups/freeform-workflow.mjs)                                                 |
| `mail`       | Mail             | 本地邮件记录、搜索、标旗、保存草稿、复制与打印。通讯范围限本地记录。                                             | [源码](apps/web/src/app/apps/mail/mail.ts) · [本地邮件](apps/e2e/src/groups/local-mail.mjs)                                                                |
| `messages`   | Messages         | 本地会话、搜索、消息写入和按会话保护草稿。发送操作写入当前浏览器。                                               | [源码](apps/web/src/app/apps/messages/messages.ts) · [本地会话](apps/e2e/src/groups/local-messages.mjs)                                                    |
| `safari`     | Safari           | 标签页、书签、历史、搜索、网页嵌入和在浏览器新标签页打开原站。网页嵌入受浏览器和站点策略约束。                   | [源码](apps/web/src/app/apps/safari/safari.ts) · [外网内容决策](requirements/decisions.md#d-04外网内容可缺失)                                              |
| `maps`       | Maps             | 加载真实瓦片、地名搜索、地图交互与本地地点。路线入口目前仅提供提示。                                             | [源码](apps/web/src/app/apps/maps/maps.ts) · [网络与离线状态](apps/e2e/src/groups/offline-resources.mjs)                                                   |
| `photos`     | Photos           | 图库、搜索、收藏、Wikimedia Commons 搜索与添加、复制图片地址。外网图片按网络可用性加载。                         | [源码](apps/web/src/app/apps/photos/photos.ts) · [内容操作](apps/e2e/src/groups/content-actions.mjs)                                                       |
| `weather`    | Weather          | 使用预置城市向 Open-Meteo 请求天气，显示当前、逐小时与逐日预报和网络状态。                                       | [源码](apps/web/src/app/apps/weather/weather.ts) · [天气服务](apps/web/src/app/services/weather-store.ts)                                                  |
| `vscode`     | Aiao Code        | 从清单配置的 `https://vscode.aiao.io/` 通过 Orbit 打开代码编辑器。桌面侧提供透明窗口与经用户授权的显式文件复制。 | [窗口宿主](apps/web/src/app/apps/web-app/web-app.ts) · [文件复制](requirements/stories/application/ADESK-US-208-aiao-code-file-copy.md)                    |
| `appstore`   | App Store        | 批准目录、权限确认、安装、打开、更新、回滚和卸载。安装记录保存在本地，应用页面仍由各发布方提供。                 | [源码](apps/web/src/app/apps/app-store/app-store.ts) · [生命周期验收](apps/e2e/src/groups/approved-catalog.mjs)                                            |

## 演示、模拟与样例驱动应用

| ID         | 应用        | 范围                                                                                                                    | 入口或数据                                                                                                                                          |
| ---------- | ----------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `podcasts` | Podcasts    | **内容展示。** 浏览预置节目和剧集卡片。搜索框为装饰，页面交互限书架浏览。                                               | [通用书架](apps/web/src/app/apps/shelf/shelf.ts) · [样例内容](apps/web/src/app/apps/shelf/shelf-data.ts)                                            |
| `tv`       | TV          | **内容展示。** 浏览预置影视卡片和「继续观看」陈列。                                                                     | [通用书架](apps/web/src/app/apps/shelf/shelf.ts)                                                                                                    |
| `books`    | Books       | **内容展示。** 浏览预置阅读清单和书籍卡片。                                                                             | [通用书架](apps/web/src/app/apps/shelf/shelf.ts)                                                                                                    |
| `facetime` | FaceTime    | **通话模拟。** 拨号后计时，静音切换界面状态，通话记录保存在本地。交互范围限日志和界面状态。                             | [界面逻辑](apps/web/src/app/apps/facetime/facetime.ts) · [记录样例](apps/web/src/app/apps/facetime/facetime-log.ts)                                 |
| `voice`    | Voice Memos | **播放模拟。** 预置标题和时长、生成波形、计时、暂停和进度拖动。数据只含备忘录元数据。                                   | [界面逻辑](apps/web/src/app/apps/voice-memos/voice-memos.ts) · [记录样例](apps/web/src/app/apps/voice-memos/voice-memos-data.ts)                    |
| `music`    | Music       | **样例曲库。** 预置专辑和歌单可浏览，Web Audio 合成器确实发声并支持播放控制。音源是内置合成曲目。                       | [播放器](apps/web/src/app/apps/music/music.ts) · [曲库](apps/web/src/app/apps/music/music-data.ts) · [合成器](apps/web/src/app/apps/music/synth.ts) |
| `stocks`   | Stocks      | **演示行情。** 本地股票和公司名搜索、详情切换可用，报价为种子值，走势图和部分指标由本地计算生成。桌面有同域股票小组件。 | [数据](apps/web/src/app/apps/stocks/stocks-data.ts) · [演示声明验收](apps/e2e/src/groups/stocks-workflow.mjs)                                       |
| `fontbook` | Font Book   | **预置字体样本。** 可搜索 8 个预置字体族并预览 CSS 排版效果。数据来源是内置清单，由浏览器解析字体栈。                   | [源码](apps/web/src/app/apps/font-book/font-book.ts) · [字体清单](apps/web/src/app/apps/font-book/font-book.seed.ts)                                |

## 随包游戏与系统入口

| ID          | 入口       | 职责                                                                                              | 源码                                                                                                                                                                               |
| ----------- | ---------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `saltline`  | 几猫3A大作 | 随桌面构建发布的可玩单文件 3D 游戏。宿主使用同源 iframe，处理焦点和隐藏暂停。刷新恢复时延迟加载。 | [游戏文件](apps/web/public/saltline.html) · [宿主组件](apps/web/src/app/apps/saltline/saltline.ts) · [运行状态验收](requirements/stories/desktop/ADESK-US-112-runtime-activity.md) |
| `launchpad` | Launchpad  | 系统入口，展示启动台浮层。                                                                        | [启动入口](apps/web/src/app/services/app-launcher.ts) · [启动台](apps/web/src/app/components/overlays/launchpad.ts)                                                                |
| `trash`     | Trash      | 系统入口，打开 Finder 的废纸篓路径。                                                              | [启动入口](apps/web/src/app/services/app-launcher.ts)                                                                                                                              |

## 演示文件与数据

### 用户在 Finder 和终端中看到的出厂文件

出厂卷的 30 个文件由 `disk-seed.ts` 定义，文本来自 `seed-text.ts`，图片、PDF 和 WAV 在初始化时生成后写入虚拟卷。`~` 表示该卷的默认用户主目录。抹掉虚拟卷后会重新生成出厂内容。[文件清单](apps/web/src/app/disk/disk-seed.ts) · [样例文本](apps/web/src/app/disk/seed-text.ts) · [虚拟卷初始化](apps/web/src/app/disk/disk-volume.ts)

| 目录                   | 实际生成的内容（20）                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `~/Desktop/`           | `prasenx.txt`、`Screenshot 2026-07-27 at 4.34.11 PM.png`、`Interface Guidelines.pdf`                                                                                                              |
| `~/Desktop/Projects/`  | `todo.md`、`desktop-web/index.html`、`desktop-web/README.md`、`desktop-web/screenshot.png`、`cleantype/main.swift`、`cleantype/Package.swift`、`aurora-synth/synth.ts`、`aurora-synth/index.html` |
| `~/Documents/Specs/`   | `materials.pdf`、`motion-audit.pdf`                                                                                                                                                               |
| `~/Documents/Writing/` | `on-restraint.md`、`shadow-notes.md`                                                                                                                                                              |
| `~/Music/`             | `aurora-synth-demo.wav`（合成音频）                                                                                                                                                               |
| `~/Pictures/`          | `lake-braies.jpg`、`dolomites-dawn.jpg`、`night-sky.jpg`（程序生成）                                                                                                                              |
| `~/.Trash/`            | `old-draft.md`                                                                                                                                                                                    |

| 目录              | 格式占位文件（10）                                                                |
| ----------------- | --------------------------------------------------------------------------------- |
| `/Library/Fonts/` | `SFPro.ttf`                                                                       |
| `~/Documents/`    | `design-review.key`、`roadmap-2026.numbers`                                       |
| `~/Downloads/`    | `Xcode_26.xip`、`sf-symbols-7.dmg`、`wallpaper-tahoe-6k.heic`、`render-final.mp4` |
| `~/Movies/`       | `interaction-study.mp4`、`capture-timelapse.mov`                                  |
| `~/Music/`        | `lofi-loop.mp3`（静音帧）                                                         |

占位文件主要提供格式标记或空容器，供 Finder 列表和文件类型识别展示。`/Applications/*.app` 由应用清单投影生成，其中的 `Info.plist` 记录真实的应用身份和入口。[格式生成](apps/web/src/app/disk/formats/stubs.ts) · [应用包投影](apps/web/src/app/disk/application-projection.ts)

### 随产品发布的初始数据

| 内容                           | 源文件和范围                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 只用于展示或模拟的数据         | Podcasts、TV、Books 与旧版 App Store 卡片来自 [shelf-data.ts](apps/web/src/app/apps/shelf/shelf-data.ts)、[shelf.seed.ts](apps/web/src/app/apps/shelf/shelf.seed.ts) 和 [shelf.entities.ts](apps/web/src/app/apps/shelf/shelf.entities.ts)。旧版 `appstore` 内容仍在 `shelf` 种子里，现行 App Store 由独立组件读取批准目录。[组件绑定](apps/web/src/app/apps/registry.ts)                                                                                                                                                                                                                                                                                                                                      |
| 示例报价、曲库、字体和媒体记录 | [Stocks](apps/web/src/app/apps/stocks/stocks.seed.ts)、[Music](apps/web/src/app/apps/music/music.seed.ts)、[Font Book](apps/web/src/app/apps/font-book/font-book.seed.ts)、[FaceTime](apps/web/src/app/apps/facetime/facetime.seed.ts)、[Voice Memos](apps/web/src/app/apps/voice-memos/voice-memos.seed.ts)                                                                                                                                                                                                                                                                                                                                                                                                   |
| 实际工作流的起始内容           | 示例笔记、任务、事件、联系人、邮件、会话、照片、城市、书签和地点。[Notes](apps/web/src/app/apps/notes/notes.seed.ts) · [Reminders](apps/web/src/app/apps/reminders/reminders.seed.ts) · [Calendar](apps/web/src/app/services/calendar.seed.ts) · [Contacts](apps/web/src/app/apps/contacts/contacts.seed.ts) · [Mail](apps/web/src/app/apps/mail/mail.seed.ts) · [Messages](apps/web/src/app/apps/messages/messages.seed.ts) · [Photos](apps/web/src/app/apps/photos/photos.seed.ts) · [Weather](apps/web/src/app/apps/weather/weather.seed.ts) · [Clock](apps/web/src/app/apps/clock/clock.seed.ts) · [Safari](apps/web/src/app/apps/safari/safari.seed.ts) · [Maps](apps/web/src/app/apps/maps/maps.seed.ts) |

应用种子共有 **17 个数据域**。实体集中登记，数据域第一次被读取时才按事务写入种子和标记。部分数据域由小组件先读取。应用已有数据留在用户库中。Freeform 从用户绘制的笔迹开始累积。[实体登记](apps/web/src/app/data/entities.ts) · [数据域登记](apps/web/src/app/data/seeds.ts) · [按需加载验收](apps/e2e/src/groups/lazy-loading.mjs)

### 测试替身与本地开发页面

| 文件或目录                                                                                                        | 用途                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [harness/standin.mjs](apps/e2e/src/harness/standin.mjs)                                                           | E2E 按需拦截 Aiao Code 或游戏的入口，用替身检查窗口、焦点、就绪、能力调用与失败状态。游戏检查组另启动真游戏验证启动。   |
| [fixtures/approved-catalog.mjs](apps/e2e/src/fixtures/approved-catalog.mjs)                                       | 受控应用目录、版本和远程入口，用来覆盖安装、更新、回滚与卸载。                                                          |
| [fixtures/github-oauth.mjs](apps/e2e/src/fixtures/github-oauth.mjs)                                               | 在测试上下文替换 GitHub 授权与回调交互。                                                                                |
| [fixtures/package-registry.mjs](apps/e2e/src/fixtures/package-registry.mjs) · [fixtures/](apps/e2e/src/fixtures/) | 本地包注册表、`terminal-package.tgz`、`aiao_terminal_smoke-1.0.0-py3-none-any.whl` 和旧构建、数据库、浏览器等测试夹具。 |
| [web/src/app/testing/](apps/web/src/app/testing/)                                                                 | Web 单测的应用登记、窗口、Orbit、VM、数据和跨标签页替身。                                                               |
| [scripts/dev/dashboard.html](scripts/dev/dashboard.html) · [dashboard.mjs](scripts/dev/dashboard.mjs)             | 本地开发导航，展示端口、命令、文档和检出信息，运行在 `127.0.0.1:4412`。                                                 |

## 调整内容时涉及的代码与数据

- **应用入口与展示。** 清单定义 ID、包标识和 Dock 默认位置。`registry.ts` 绑定运行组件，`LAUNCH_ORDER` 决定启动台和聚焦搜索顺序，`/Applications` 按 `showInApplications` 投影。图标、菜单、保存的 Dock 和窗口布局也依赖 ID。移除或改名时，相关验收集中在 Applications、Dock、窗口恢复和升级检查组。[清单](apps/web/src/app/apps/app-manifests.ts) · [绑定](apps/web/src/app/apps/registry.ts) · [顺序与身份](apps/web/src/app/services/desktop-apps.ts) · [升级验收](apps/e2e/src/groups/applications-upgrade.mjs)
- **样例展示与持久化。** Stocks、Weather、Calendar、Reminders 的数据域同时被壳层小组件读取。书架数据、出厂文件和已有浏览器库分别有自己的写入与升级路径。调整初始内容会影响新库和重置后的出厂内容，已有库由种子标记与迁移机制处理。[数据域](apps/web/src/app/data/seeds.ts) · [小组件](apps/web/src/app/components/widgets/widgets.ts) · [升级验收](apps/e2e/src/groups/upgrade-previous.mjs)
- **批准目录与远程应用。** 运营内容由 `approved-apps.json` 和构建固定摘要控制。已安装版本并入统一登记表，通过 Orbit 加载自己的远程产物。应用管理流程和可安装目录可独立盘点。[批准目录](apps/web/public/approved-apps.json) · [批准摘要](apps/web/src/app/data/approved-catalog-config.ts) · [安装流程](apps/web/src/app/services/app-installation-flow.ts)
- **文档口径。** 当前磁盘工具已经有导出、恢复和存储健康检查，根 README 首段的备份表述早于对应实现。产品能力的证据见该故事和正式产物验收记录。[产品 README](README.md) · [ADESK-US-111](requirements/stories/desktop/ADESK-US-111-backup-and-storage-health.md) · [验收台账](requirements/verification-report.md)
