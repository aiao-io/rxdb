# @aiao/browser-workbench-vue

浏览器本地开发工作台的 Vue 绑定，复用现有 CodeMirror 组件。三端共享文件、Git、编译与隔离预览内核。

公开入口：`BrowserWorkbench` 与 `BrowserWorkbenchOptions`。组件读取初始 `options`，卸载时销毁编辑器、Worker 与预览。

用法、静态资源部署、RxDB 目录、支持边界与验证命令见 [核心包文档](../browser-workbench/README.md)。
