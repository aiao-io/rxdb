# `dev-rxdb-vue` 代码评审

## 结论

🔴 不通过。OPFS 重命名存在与 Angular 端相同的数据覆盖/删除缺陷；路由状态和 MIME 渲染也不可靠。三端对称不能只对称 API，缺陷也复制一遍不算完成。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：`apps/dev-rxdb-vue` 下源码、路由、测试和 Nx 配置；100 个文件
- 自动校验：此次仅进行只读代码审查，未单独运行本项目的 `lint`、`test`、`typecheck`、`build`，不能据此判定通过
- 测试现状：6 个 spec/test 文件；缺少 OPFS 冲突、历史导航和非图片 MIME 渲染测试

## 问题

| ID | 级别 | 位置 | 问题与影响 | 建议 |
| --- | --- | --- | --- | --- |
| VUE-001 | P1 | `src/pages/opfs/composables/useOpfsService.ts:228` | `renameEntry()` 用 `{ create: true }` 打开目标：同名文件会被覆写，同名目录会被递归合并，之后源条目被删除；新旧名称相同还可能最终删除自身。名称冲突可直接丢失用户数据。 | 写入前拒绝空名称、原名称和已存在目标；复制到唯一临时条目，完整校验后再提交，任意失败只清理临时条目而不得删除源。与 Angular 端共享同一组数据完整性契约。 |
| VUE-002 | P2 | `src/pages/opfs/OpfsPage.vue:103` | 路由参数只在 `onMounted()` 读取。组件复用期间使用 back/forward 或跳转到另一 OPFS 深层路径，URL 改了但当前目录不变；当前目录 watcher 还可能把旧路径重新写回 URL。 | watch 规范化后的路由参数并驱动目录状态，区分路由导航和内部目录导航以防循环；覆盖 back、forward 和直接深链切换。 |
| VUE-003 | P2 | `src/pages/RemoteCachePage.vue:315` | 缓存项无论 MIME 类型都渲染为 `<img>`。文本、PDF、音频和视频会显示破图，页面却仍把它们当成成功缓存内容，功能声明与实际能力不一致。 | 按 MIME 建模预览策略：图片、音视频、文本预览和通用下载分别渲染；不支持的类型明确显示元数据与下载操作，并在卸载/删除时释放 object URL。 |
| VUE-004 | P2 | `src/**/*.{ts,vue}` | 生产代码仍有多处显式 `any`，路由、实体和浏览器 API 边界失去类型保护，与仓库 TS strict 要求冲突。 | 外部输入改为 `unknown` 后收窄，为实体、事件和浏览器能力定义具体类型；不得新增类型抑制或用宽泛断言替代建模。 |

## 其余观察 / 测试缺口

- Vue 端仅 6 个 spec/test 文件，无法覆盖文件管理、缓存预览和 URL 状态三条主要用户路径。
- OPFS 重命名缺陷与 Angular 端同构，说明共享行为没有沉淀成可复用实现或跨框架契约测试。
- remote-cache 页面创建 object URL 后，类型分支和生命周期应一起验证，避免修好预览却留下资源泄漏。

## 验收条件

- 文件和目录重命名必须拒绝同名及目标冲突；复制失败时源数据完整，目标无半成品。
- 增加 OPFS 数据完整性、浏览器历史导航，以及图片/文本/PDF/音视频 MIME 分支测试。
- 清除生产代码中的 `any`，修复后执行 `pnpm nx lint dev-rxdb-vue`、`pnpm nx test dev-rxdb-vue`、`pnpm nx typecheck dev-rxdb-vue`、`pnpm nx build dev-rxdb-vue`。
