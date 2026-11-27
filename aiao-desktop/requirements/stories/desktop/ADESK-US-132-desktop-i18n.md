---
id: ADESK-US-132
title: 界面多语言（跟随系统 + 语言与地区切换）
status: In Progress
priority: Medium
epic: ADESK-EPIC-002
created: 2026-11-24
updated: 2026-11-26
tags: [i18n, settings, shell]
dependsOn: []
capabilities: [rxdb:US-911]
---

# 用户故事：界面多语言（跟随系统 + 语言与地区切换）

## 作为/我想要/以便

**作为** 使用非英文系统的用户
**我想要** 桌面界面跟随系统语言显示（中文系统显示中文，其他语言回退英文），并能在「系统设置 → 语言与地区」里选择界面语言、即时生效并持久保存
**以便** 像 macOS 一样用自己的母语使用桌面，切换语言无需刷新页面。

实现使用仓库已交付的 `@aiao/rxdb-i18n` 与 `@aiao/rxdb-i18n-angular`（rxdb:US-911），语言偏好存库内非版本化实体 `I18nSettings`（不进撤销/分支历史，跨标签页经 RxDBTabsGateway 跟随）。方案见 [plans/2026-11-24-desktop-i18n.md](../../plans/2026-11-24-desktop-i18n.md)。

## 设计决策

1. **中英双语，英文为回退基线**：目录注册 zh / zh-Hans / en 三份（zh 与 zh-Hans 是同一份中文消息的双注册——BCP 47 父链 zh-CN→zh 推不出 zh-Hans，只注册 zh-Hans 会让中文系统首启显示英文）；`defaultLocale:'en'`，中文系统自动中文、其他语言系统回退英文（macOS「开发语言」语义）。
2. **跟随系统用 macOS 传统语义**：首次建行冻结 `deviceLocale`（navigator.language），之后系统语言变化不自动改（重登录生效）；应用内覆盖 `devicePreferredLocale` 即时生效并持久化。v1 不做 languagechange 热跟随与「跟随系统」重置（库无 reset API）。
3. **初始化串行**：`i18nEntities()` 与桌面实体一起在 RxDB.init 前注册；`I18n.init()` 在 `DesktopData.ready` 之后执行——i18n 的 connect 引导不持 STARTUP_LOCK，过早 init 会静默补建表、掩盖 `probeSchema` 的损坏探测，并与其他标签页的升级交错。
4. **设置分区名目录化后搜索按本地化名称匹配**：分区 `name` 改为目录 key，`filterSettingsGroups` 用当前语言的翻译结果匹配，zh 界面搜「网络」命中 Network 分区。
5. **aria-label 走同一翻译管线**（衔接 ADESK-US-108：读屏语言与界面语言一致）。

## 范围边界

### In Scope

- 框架接线：i18n 实体注册、运行时工厂、根 provider、串行初始化、`<html lang>` 跟随、退出销毁
- 外壳与设置面目录化（阶段 1）：设置分区名与搜索、General 面板行、「语言与地区」分区、开机/锁屏/数据问题三屏、菜单栏、Dock、浮层与 toast、窗口按钮与状态图标的 aria
- 语言与地区分区：语言列表（English / 简体中文，'zh' 归并不展示）、当前语言标记、点击切换即时生效
- 语言偏好持久化、刷新保持、跨标签页跟随；zh-CN 设备首启中文
- e2e 全局钉 en-US 保护既有英文断言；新增 language 检查组
- 全部内置应用文案与约 270 条服务错误消息目录化（阶段 2）；应用显示名本地化；format.ts 调用点与日历解析方向接线（阶段 2）

### Out of Scope

- 种子与磁盘样例数据（数据非 UI；已有库不被覆盖，D-07）
- Aiao Code 与静态 HTML 游戏内部文案（各自来源翻译，宿主只翻译外壳）
- PWA 静态安装元数据（manifest 名称/lang、apple-mobile-web-app-title、description meta，安装时定死）
- 机翻、翻译管理后台；小程序运行时（rxdb:US-911 排除）
- languagechange 热跟随、「跟随系统」重置、语言与区域独立设置（列后续）
- 品牌名 "Aiao Desktop" 不翻译

## 交付阶段

| 阶段 | 交付                                                               | 状态 |
| ---- | ------------------------------------------------------------------ | ---- |
| 1    | 框架接线 + 外壳/设置面目录化 + 语言与地区分区 + e2e 钉语言与语言组 | ✅   |
| 2    | 30 个内置应用与错误消息目录化、应用显示名、格式化接线              | ⚠️   |
| 3    | 旧库升级账本、构建体积自查、verify 全绿与发布                      | ⚠️   |

## 验收标准

### 阶段 1 — 框架接线与设置面

| #   | 前置条件                               | 操作                                                                                          | 预期结果                                                                                                                                         | 状态 |
| --- | -------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | 静态 I18n（无库）挂三份目录            | 以 zh-CN / zh-Hans / zh-TW / en-US / de-DE 为 deviceLocale 调 `t('settings.section.general')` | zh* 设备返回「通用」，en-US 返回「General」，de-DE 回退「General」；未登记 key 返回 key 本身                                                     | ✅   |
| 2   | 桌面装配完成                           | 打开系统设置                                                                                  | 分区名与搜索占位为英文原文案（与改动前逐字一致）；切到 zh 后分区名为 Apple 简体中文术语（通用/外观/墙纸…），搜索「网络」命中 Network 分区        | ✅   |
| 3   | 系统设置打开                           | 进入「语言与地区」分区，点「简体中文」                                                        | 设置界面即时变为中文，标题为「语言与地区」，简体中文行标记「首选」，`<html lang>` 变为 zh-Hans；语言列表只有 English 与简体中文两项（'zh' 归并） | ✅   |
| 4   | AC3 完成                               | 刷新页面后打开系统设置                                                                        | 界面仍为中文（devicePreferredLocale 落库，刷新保持）                                                                                             | ✅   |
| 5   | AC3 完成                               | 同一来源新开第二个标签页并打开系统设置                                                        | 第二标签页界面为中文（RxDBTabsGateway 跟随）                                                                                                     | ✅   |
| 6   | e2e 以 `locale:'zh-CN'` 上下文打开桌面 | 首启（全新库）后打开系统设置                                                                  | 界面为中文（deviceLocale 经 zh 目录命中，首启即中文）                                                                                            | ✅   |
| 7   | e2e 会话统一钉 `locale:'en-US'`        | 跑既有 Chromium 冒烟                                                                          | 全部既有英文断言照常通过（语言接入不改变默认英文界面）                                                                                           | ✅   |
| 8   | 桌面装配完成                           | 查看开机/锁屏/数据问题三屏与窗口按钮 aria                                                     | 文案走目录（zh 下为中文），data-problem 含参数消息（版本/原因插值）                                                                              | ✅   |
| 9   | 桌面装配完成                           | 查看菜单栏、Dock、浮层与 toast                                                                | 文案走目录（zh 下为中文），右键菜单与菜单栏同源覆盖                                                                                              | ✅   |

### 阶段 2 — 应用面

| #   | 前置条件        | 操作                                                                | 预期结果                                                                                        | 状态 |
| --- | --------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---- |
| 10  | 阶段 1 完成     | 逐个打开 30 个内置应用                                              | 用户可见文案走目录（zh 下为中文，en 下与原文逐字一致）                                          | ✅   |
| 11  | 阶段 1 完成     | 触发各服务的错误消息（github、桌面数据、存储等）                    | 面向用户的错误消息走 error.* 目录，开发向字符串保持原样                                         | ✅   |
| 12  | 阶段 2 文案完成 | 切到中文                                                            | 启动台/聚焦搜索/Dock 的应用显示名显示中文（访达/系统设置…），按 appId 传播；Finder 双名场景正常 | ✅   |
| 13  | 阶段 1 完成     | 在 zh 界面看菜单栏时钟、桌面日历小组件、锁屏日期、Facetime 通话记录 | 数字/日期/相对时间按 zh 区域格式显示；日历快速添加支持中文月份输入                              | ⬜   |

### 阶段 3 — 收口

| #   | 前置条件           | 操作                                         | 预期结果                                                           | 状态 |
| --- | ------------------ | -------------------------------------------- | ------------------------------------------------------------------ | ---- |
| 14  | 阶段 1 完成        | 用旧构建建库、带数据升级到含 i18n 实体的构建 | i18n 四表由连接补建，旧数据保留，schema 指纹快照更新，回滚目标不变 | ⬜   |
| 15  | 阶段 2 完成        | 正式构建后测量 initial 体积                  | initial ≤ 1.3mb 警告线                                             | ⚠️   |
| 16  | 全部 AC 有同层证据 | `pnpm nx run aiao-desktop:verify`            | 全绿（含 requirements-check 认可本故事）                           | ⚠️   |

AC13 待接：`shared/format.ts` 的 DAYS/MONS3 英文星期/月份与日期拼接（菜单栏时钟、日历小组件、锁屏日期、FaceTime 通话记录、照片分组标题等显示点）；zh 下星期与日期仍为英文格式。AC15 实测：initial 原始字节 1.43 MB / gzip 465 KB——高于 1.3 MB 警告线（改动前已越线，存量问题）；zh 目录已拆为懒加载 chunk（否则会到 1.59 MB 超 1.5 MB 硬限），进一步压体积与发布由阶段 3 收口。AC16 见 verify 运行记录。

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：AC1 见 `desktop-i18n.spec.ts` 与 `settings-data.spec.ts`；AC2-6 见 `apps/e2e/src/groups/language.mjs`（正式构建冒烟全绿）与 `settings-workflow.mjs`；AC7 见 verify 全量冒烟（含 settings-workflow 与全部既有英文断言）；AC8-9 见 shell-interaction/a11y/dock 组（en 原文案零扰动回归）与 language 组 shellLocalized（Apple 菜单与锁屏 zh）；data-problem 参数消息由 data-problem.spec 经真实目录覆盖，目录 key 成对性由 desktop-i18n.spec 门禁；AC10-12 见 `desktop-i18n-coverage.spec.ts`（源码每个 t() 用到的 key 必须同时存在中英目录）、各应用 spec 经英文目录零扰动回归（`testing/fake-i18n.ts` 委托随包 en 目录）、AC12 另由 `services/desktop-app-name.spec.ts`（appDisplayName 按 nameKey 取显示名、无 nameKey 品牌名回退）覆盖，应用冒烟组与 language 组的 en/zh 运行见各次提交的冒烟记录；AC13-16 见验收台账。带日期的运行记录见 PR 描述与各次提交。桌面行为的证据是正式构建上的浏览器冒烟。

## 技术笔记

- **接线落点**：`entities.ts` 的 DESKTOP_ENTITIES 追加 `...i18nEntities()`；`desktop-database.ts` 抽 `getDesktopDatabase()` 单例；`app.config.ts` 加 `provideI18n`；`desktop-page.ts` 在 `DesktopData.ready` 之后 `i18n.init()` 并订阅 `<html lang>`；`main.ts` 退出时 `destroyDesktopI18n()`。
- **目录**：`src/app/i18n/`（messages-en.ts / messages-zh.ts / desktop-i18n.ts），命名空间 `'desktop'`，zh 与 zh-Hans 双注册同一份中文消息；v1 只用简单插值，不用 plural/select；英文目录 = 现有硬编码原文案逐字。含直撇号的 en 值按 ICU 写成 `''`（渲染输出与原文字符一致，如 `isn''t`）；目录键按字母序生成，`desktop-i18n-coverage.spec.ts` 静态扫源码断言每个 t() 键都成对存在。
- **应用显示名（AC12）**：清单 `nameKey`（`apps.<id>.name`）经 `services/desktop-app-name.ts` 的 `appDisplayName` 在显示点（窗口标题/窗口状态、Dock、启动台、聚焦搜索、菜单栏、强制退出、调度中心、通知横幅、打开方式下拉、菜单 {name} 插值）取当前语言名；品牌名（Aiao Code、GitHub Desktop、App Store 等）不译回退清单 `name`；`DesktopAppDefinition` 沿用清单字段，nameKey 随它传播。种子与磁盘样例数据（联系人、专辑、照片标题、城市名等）按范围边界保持英文。
- **错误消息（AC11）**：面向用户的错误走 `error.*` 目录，显示边界翻译（`app-installation-flow` 的消息→key 映射、`local-write-error`/`print-document`/各纯函数的可选 translate 参数）；开发向 throw 消息与内部字符串保持原样。
- **语言与地区分区**：`SETTINGS_GROUPS` 新增 `language-region` 分区（general 之后），面板 `panes/language-region-pane.ts`；`effectiveLanguageOf(locale)` 把 zh* 归一为 zh-Hans、其余归 en；语言列表固定 English / 简体中文，点击 `setLocale`。
- **zh 术语规范**：以 Apple 官方简体中文界面译名为准——访达 Finder、系统设置 System Settings、聚焦 Spotlight、启动台 Launchpad、废纸篓 Trash、程序坞 Dock、墙纸 Wallpaper、通用 General、外观 Appearance、显示器 Displays、声音 Sound、电池 Battery、通知 Notifications、隐私与安全性 Privacy & Security、语言与地区 Language & Region、关于本机 About This Mac、储存空间 Storage、隔空投送与接力 AirDrop & Handoff、登录项与扩展 Login Items & Extensions、日期与时间 Date & Time、共享 Sharing、时间机器 Time Machine、首选语言 Preferred Languages、首选 Primary。
- **已知例外**：I18nSettings 首建写发生在桌面写前守卫启用之前，是启动期写守卫的一处已知例外（守卫只拦业务写）。

## 实现文件

- `aiao-desktop/apps/web/src/app/i18n/` — 目录与运行时工厂（desktop-i18n.ts / messages-en.ts / messages-zh.ts / desktop-i18n-coverage.spec.ts）
- `aiao-desktop/apps/web/src/app/data/entities.ts`、`desktop-database.ts`、`app.config.ts`、`pages/desktop-page.ts`、`main.ts` — 装配接线
- `aiao-desktop/apps/web/src/app/apps/settings/` — 分区名目录化、搜索本地化、语言与地区分区（panes/language-region-pane.ts）
- `aiao-desktop/apps/web/src/app/services/desktop-app-name.ts`、`apps/app-manifests.ts`（nameKey）、`shared/disk-kind-label.ts` — 应用显示名与磁盘种类标签（AC12）
- `aiao-desktop/apps/web/src/app/testing/fake-i18n.ts` — 单测英文目录运行时（en 逐字基线，既有断言零扰动）
- `aiao-desktop/apps/web/src/app/apps/*`、`components/*`、`services/*` — 各应用文案与面向用户错误消息目录化（AC10-11）
- `aiao-desktop/apps/e2e/src/harness/session.mjs`、`src/groups/language.mjs` — e2e 钉语言与语言组

## References

- 方案：[plans/2026-11-24-desktop-i18n.md](../../plans/2026-11-24-desktop-i18n.md)
- 平台能力：[rxdb:US-911](../../../../requirements/stories/future/US-911-client-i18n.md)
- 决策：[D-29](../../decisions.md#d-29界面多语言中英双语与切换方式)
