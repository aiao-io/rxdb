---
id: US-533
title: 后台外壳顶栏部件、锁屏与通用设置：语言、时区、水印、版权页脚
status: In Progress
priority: Medium
epic: epic-010-model-driven-admin-framework
created: 2026-11-06
updated: 2026-11-06
tags: [domain, admin-framework, admin-shell, widgets, lock-screen, i18n, cross-framework]
---

# 用户故事：后台外壳顶栏部件、锁屏与通用设置：语言、时区、水印、版权页脚

## 作为/我想要/以便

**作为** 使用模型驱动后台管理框架的使用者
**我想要** 在顶栏快速切换语言、时区、主题，临时离开时一键锁屏，并按需要给页面加水印、显示版权页脚
**以便** 多人共用设备或截图分享时保护界面内容，跨时区、跨语言使用时看到自己熟悉的时间与文案。

## 范围依据

owner 于 2026-11-06 批准，是 [US-530](US-530-admin-shell-preferences-appearance.md) 偏好中心的部件、锁屏与通用设置分组。
锁屏的定位是「防偷看」，不是安全边界——数据并未加密，文档与界面都如实说明。

## 范围边界

### In Scope

- 顶栏部件：搜索、语言、时区、主题、全屏、刷新、锁屏、偏好设置八个部件，按偏好的顺序与显隐渲染；偏好设置部件固定可见（隐藏后设置入口只剩快捷键）；
  抽屉的「通用」之外，部件的显隐与顺序在抽屉里以列表管理（拖拽与键盘移动）；窄屏下隐藏次要部件的文字与部分部件。
- 语言：外壳文案命名空间 `rxdb-admin` 随包提供 `zh-Hans` 与 `en`，可并入应用已有的 `@aiao/rxdb-i18n` 运行时；切换后外壳全部文案即时更新并保留，`<html lang>` 随外壳语言同步（卸载时恢复宿主原值），读屏软件才会选对语音。
- 时区：按地理分组列出常用时区、各自当前时间与 UTC 偏移，「跟随浏览器」可还原；生效时区用于外壳的日期格式化。
- 锁屏：原生模态 `<dialog>` 遮住界面，首次使用要求设置密码，之后用密码解锁；Esc 与刷新不能绕过，锁定状态持久化并跨标签同步；
  忘记密码可确认后重置（数据不受影响）；密码以 PBKDF2-SHA256（Web Crypto）加盐哈希，环境缺少 `crypto.subtle` 时明确报错而不退让为弱哈希。
- 通用设置：页面切换动画（`fade` / `fade-slide` / `fade-up` / `fade-down`）、顶部进度条、加载遮罩、动态标题；水印（默认取品牌名，可自定义文案）；
  版权信息（公司、链接、年份、ICP）与页脚；Logo（图片地址、是否显示文字）。
- 全屏切换与刷新。
- Angular / React / Vue 同功能；`apps/dev-rxdb-admin` 接入并以 `apps/dev-rxdb-admin-e2e` 完成组合验收。

### Out of Scope

- 把锁屏当作访问控制或数据加密使用；需要加密请使用 `@aiao/rxdb-adapter-encrypted`。
- 服务端会话超时锁定、登录态联动。
- 外壳文案之外的业务文案翻译（由应用的国际化运行时负责）。

## 验收标准

| #   | 前置条件               | 操作                                                               | 预期结果                                                                                         | 状态 |
| --- | ---------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ---- |
| 1   | 外壳已挂载             | 在抽屉里隐藏、重排部件；尝试隐藏偏好设置                           | 顶栏按偏好顺序与显隐渲染，偏好设置部件不可隐藏；窄屏隐藏次要部件而不挤出设置入口                 | ⬜   |
| 2   | 默认中文               | 切换到 English，打开抽屉，刷新                                     | 外壳文案（抽屉标题、页签、按钮）即时切换并在刷新后保留，`<html lang>` 同步为 `en`                | ⬜   |
| 3   | 选择非本地时区         | 打开时区菜单，选择某个城市，再选「跟随浏览器」                     | 菜单按地理分组并显示各地当前时间与偏移，按钮显示偏移并带可访问名称；选择写入偏好，跟随浏览器清空 | ⬜   |
| 4   | 从未设置过锁屏密码     | `Alt+L` 或点击锁屏部件，设置密码；再次锁定，输错 / 输对；Esc；刷新 | 首次要求设置并立即解锁；之后错误密码被拒绝并提示；Esc 与刷新都不能绕过；输对解锁                 | ⬜   |
| 5   | 已设置密码并锁定       | 点击「忘记密码」并确认重置                                         | 密码被清除并解锁，业务数据不受影响，下次锁屏重新要求设置密码；缺少 Web Crypto 时给出明确错误     | ⬜   |
| 6   | 通用页签               | 开启水印并填写文案，开启页脚、调整切换动画与进度条                 | 水印层覆盖内容区，页脚出现并带版权信息，切换动画与进度条按设置生效，均持久化                     | ⬜   |
| 7   | 三框架外壳与真实工作台 | 在 Angular / React / Vue 与 `apps/dev-rxdb-admin` 上执行相同流程   | 三端行为与 DOM 契约一致；顶栏部件、锁屏、水印与页脚开启时 axe 零违规                             | ⬜   |

验收证据：见下方「验收证据」。

## 技术笔记

- [`LockController`](../../../packages/rxdb-admin/src/widgets/lock.ts)：锁定状态与密码哈希都存在本机存储，`webCryptoHasher` 在缺少 `crypto.subtle` 时抛错；
  构造时读取已保存状态并监听 `storage` 事件，实现跨标签锁定。
- [`visibleWidgets`](../../../packages/rxdb-admin/src/widgets/widget-order.ts) 合并偏好的顺序与隐藏列表并保证固定部件可见，`moveVisibleWidget` / `toggleWidgetHidden` 供抽屉的部件列表使用；
  [`buildTimezoneEntries`](../../../packages/rxdb-admin/src/widgets/timezone.ts) 产出分组时区与偏移（统一 `GMT` 写法，规避不同 ICU 版本的差异）。
- 水印由 [`watermarkBackground`](../../../packages/rxdb-admin/src/widgets/watermark.ts) 画成 `background-image`（`data:` URL），外壳 `watermark` 存储对三端是同一个 CSS 值。
- 部件文字的显隐由样式契约按视口宽度控制（≤768px 隐藏文字，≤480px 隐藏语言 / 时区 / 全屏）。
- 可访问名称必须包含按钮上全部可见文字（WCAG 2.5.3）：时区按钮的名称带偏移（「时区：GMT+8」），搜索按钮的名称带键帽（「搜索 ⌘ K」）。

## 实现文件

- `packages/rxdb-admin/src/widgets/`、`src/i18n/` — 锁屏、水印、时区、全屏、部件顺序与外壳文案目录。
- `packages/rxdb-admin-{react,vue,angular}/src/widgets/`、`src/lock/`、`src/watermark.*`、`src/layout/footer.*` — 三端部件、锁屏、水印与页脚。
- `apps/dev-rxdb-admin-e2e/src/admin-shell.spec.ts`、`admin-shell.a11y.spec.ts` — 锁屏、语言、水印与页脚的组合验收。

## 验收证据

- 核心单测：[部件、锁屏、水印、时区](../../../packages/rxdb-admin/src/__tests__/widgets/widgets.spec.ts)、[外壳装配](../../../packages/rxdb-admin/src/__tests__/shell/shell.spec.ts)。
- 三端组件单测：[React 部件与上下文](../../../packages/rxdb-admin-react/src/__tests__/widgets-context.spec.tsx)和[锁屏](../../../packages/rxdb-admin-react/src/__tests__/palette-lock.spec.tsx)，
  [Vue](../../../packages/rxdb-admin-vue/src/__tests__/widgets-context.spec.ts)，[Angular](../../../packages/rxdb-admin-angular/src/__tests__/widgets-context.spec.ts)。
- 真实工作台：[外壳验收](../../../apps/dev-rxdb-admin-e2e/src/admin-shell.spec.ts)（锁屏、忘记密码、语言、水印与页脚）与 [a11y 走查](../../../apps/dev-rxdb-admin-e2e/src/admin-shell.a11y.spec.ts)。

## References

- [epic-010 模型驱动后台管理框架](../../epics/epic-010-model-driven-admin-framework.md)
- [US-530 偏好中心与外观设置](US-530-admin-shell-preferences-appearance.md)
