# Aiao Media 安装版

首阶段目标为 macOS 13+、Apple Silicon。没有 Windows、Linux 或 Intel 安装验收，也不启用应用内自动更新。

通过 Nx 运行：

```sh
pnpm nx run aiao-media:build:desktop
pnpm nx run aiao-media:desktop-test
pnpm nx run aiao-media:desktop-package
```

前端产物位于 `desktop-dist/browser`，与 Web 的 `dist/browser` 分开。Rust 产物位于 `src-tauri/target`；本地构建或 ad-hoc 签名不代表可公开发行，正式安装包仍需 Apple 发行签名、公证与安装升级验收。

数据库在系统应用数据目录 `io.aiao.media/rxdb-data`，原图在同目录下 `rxdb-files`，工作区指针及格式标记分别为 `media-profile-v1`、`media-schema`。清理 WebView 缓存不丢失原生工作区索引。供应商 Key 只保留当前会话；可选账号会话仍由 SDK 保存在此应用 WebView 的本机存储中，退出会清除，不进入图片备份。

Web 与安装版不默认共用数据库。迁移使用不含 Key 的 JSON 备份或显式元数据同步；原图仍需备份迁移。首次绑定前必须重新确认目标和数据范围。下载通过原生保存对话框选择目标，取消和失败不确认完成；分块临时写入并在成功后原子替换。

原生窗口只加载打包的 `tauri://localhost` 页面；远程导航被拒绝，没有任意文件插件、shell 或远程 IPC 权限。API 固定请求正式产品域名，CORS 仅在运营方显式允许安装版 origin 时开放；鉴权与业务权限继续在服务端执行。支付只允许系统浏览器打开 Stripe Checkout HTTPS 地址。

手动升级通过安装新包完成，禁止清理应用数据目录。兼容标记只升不降，更高版本拒绝打开。卸载应用包不会由本程序自动删除应用数据；如需清理，先完整导出备份，退出应用后由用户明确删除应用数据目录。当前尚无签名公证、实际覆盖安装、卸载重装的数据保留证据，不能据此声称已发行。
