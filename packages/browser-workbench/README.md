# @aiao/browser-workbench

浏览器内的本地开发工作台。使用现有 CodeMirror 编辑器、独立 OPFS Git 仓库、受控编译 Worker 与隔离预览；支持 JavaScript / TypeScript、React TSX、Vue SFC 和 Angular standalone 模板。

布局使用 `dockview-core`，图标使用微软官方 `@vscode/codicons`。界面沿用 VS Code Dark Modern 的活动栏、资源管理器、编辑标签、预览、问题 / 输出 / Console 面板和状态栏。编辑标签可拖动拆分、合并与停靠；预览与编辑器在布局移动时保留实例、撤销记录和运行状态，支持一键重置布局。

首次打开空目录会生成最小 React、Vue、Angular Demo；后续重开恢复最近使用的项目。

## 开始使用

选择宿主框架对应的绑定，三个宿主都能运行四类项目模板：

```tsx
import { BrowserWorkbench } from '@aiao/browser-workbench-react';

export function App() {
  return <BrowserWorkbench options={{ assetBaseURL: '/browser-workbench-assets/' }} />;
}
```

```ts
import { BrowserWorkbench } from '@aiao/browser-workbench-angular';
import { Component } from '@angular/core';

@Component({
  imports: [BrowserWorkbench],
  template: '<ao-browser-workbench [options]="options" />'
})
export class App {
  readonly options = { assetBaseURL: '/browser-workbench-assets/' };
}
```

```vue
<script lang="ts" setup>
import { BrowserWorkbench } from '@aiao/browser-workbench-vue';
const options = { assetBaseURL: '/browser-workbench-assets/' };
</script>

<template><BrowserWorkbench :options="options" /></template>
```

为宿主容器设置明确高度。框架组件的 `options` 在初始化时读取；切换服务或资源版本时重新挂载组件。

## 部署静态资源

将已安装包的 `dist/assets/` 整目录复制到站点的 `public/browser-workbench-assets/`。目录包含固定版本的编译器 WASM、Git WASM、Worker、Angular 转译器、前端运行时、Dockview 样式、Codicons 样式 / 字体 / 许可证和 SHA-256 资源清单，不能只复制两个 WASM 文件。

资源目录只托管包内的公开固定文件，不放业务 API 或重定向。WASM 响应使用 `application/wasm`，JS 使用 `text/javascript`，CSS 使用 `text/css`，TTF 字体使用 `font/ttf`；需要跨源加载时设置 `Access-Control-Allow-Origin: *` 与 `Cross-Origin-Resource-Policy: cross-origin`。资源路径由 `assetBaseURL` 指定，末尾可带 `/`。

离线重开需要宿主 Service Worker 缓存应用外壳、该页面的懒加载模块与完整资源目录。首次访问缺少资源时不承诺离线启动；缺资源或摘要不符会明确报错。仓库的三端 Demo 已配置这些静态资源；真实冻结安装、独立消费和离线验证的入口见下方。

## 数据与恢复

代码文件与 `.git` 在 `aiao-browser-workbench/projects/<projectId>/` 下，由 Git Worker 独占。编辑缓冲、已保存 revision 与 Git commit 是三个不同状态；运行前先保存，但不会自动提交。`Ctrl/⌘ + S` 保存，`Ctrl/⌘ + Enter` 运行。

Git 视图可逐文件暂存、提交和查看历史。选择历史提交时，需要干净的缓冲与 Git 状态；恢复只把对应文件树写回工作区，形成待审查差异，HEAD 和 index 不变。

导出 ZIP 包含源码、资源、依赖锁、暂存区和 `.git`，不包含构建缓存。导入到全新项目空间，不覆盖已有仓库。导出后可在 Node.js 26 与 pnpm 12 下执行 `pnpm install --frozen-lockfile`、`pnpm build`，继续使用普通 Git。

OPFS 按站点隔离，清除站点数据会删除项目；数据库备份不包含这个独立目录。请使用项目导出保留完整源码与历史。

## 项目目录接入 RxDB

默认独立演示在另一个 OPFS 根保存项目目录。宿主已有 RxDB 时，注册 `WorkbenchProject` 并把目录服务传入组件：

```ts
import { WorkbenchProject, createRxDBWorkbenchCatalog } from '@aiao/browser-workbench/rxdb-catalog';

// 将 WorkbenchProject 加入宿主 RxDB 的 entities，完成 init / adapter 接入。
const options = {
  assetBaseURL: '/browser-workbench-assets/',
  catalog: createRxDBWorkbenchCatalog(db)
};
```

实体 `log: false`、`sync: None`。只存项目名称、模板、入口和最近打开时间；代码与 Git 历史不写进数据库。三端 Demo 都使用宿主 RxDB 目录服务。

## 支持范围

当前验收宿主为桌面 Chromium，要求安全上下文、OPFS、Web Locks、WebAssembly JSPI 和 credentialless iframe。缺少能力时明确失败，没有内存存储替代路径。

项目运行在 `sandbox="allow-scripts"` 的 opaque origin iframe，无法读取 IDE 或其他项目的 DOM、OPFS、数据库和登录凭据；消息通道只回传当前会话的诊断，不提供宿主文件写入接口。这个边界不等于全网访问沙箱；不能据此宣称任意 JavaScript 的导航或 WebRTC 已被完全封锁。

受控模板只解析项目快照与固定依赖。支持本地模块、普通 CSS、图片与 Vue scoped style；Angular 使用浏览器 JIT 与 TS 装饰器转换。完整 TS 类型检查、任意 npm 安装、Node API、终端、SSR、任意 Nx / Vite 插件、Git remote、AI 和实时协作不在当前范围。

单项目限制：2,000 文件、单文件 2 MiB、文件总量 20 MiB、ZIP 24 MiB；不支持符号链接、可执行位和子模块。写入用仓库级 Web Lock 串行化，崩溃后先检查恢复日志，不误报写入成功。

Dockview 的 MIT 声明与 Codicons 的图标 / 字体 CC BY 4.0、代码 MIT 声明随 `assets/licenses/` 分发；Codicons 来自 Microsoft。Git WASM 的 GPL v2 + linking exception 声明随 `assets/git/COPYING` 分发。前端编译器与运行时的许可文本也包含在发布资源中。

## 验证

所有任务通过 Nx 执行：

```sh
pnpm nx test browser-workbench --coverage
pnpm nx run browser-workbench:verify-export
pnpm nx run browser-workbench:verify-consumers
pnpm nx run browser-workbench:verify-offline
pnpm nx run browser-workbench:verify-docking --url=http://127.0.0.1:4201/browser-workbench --host=react
pnpm nx e2e dev-rxdb-react-e2e browser-workbench.spec.ts --workers=1
```

`verify-export` 对四类模板执行仓外冻结锁安装、生产构建与 Chromium 交互；`verify-consumers` 从真实 tarball 安装核心及三端绑定，检查 Worker / WASM、编辑器、预览与重开；`verify-offline` 检查缓存后的断网重开与四类项目运行。`verify-docking` 面向已启动的演示应用，以真实鼠标拖拽验证拆分、停靠、撤销记录 / 预览保活和官方字体摘要。原始报告保存在 `benchmarks/reports/browser-workbench-*.json`。
