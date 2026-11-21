# Aiao Media Desktop

- 本目录是 Aiao Media 的独立桌面应用，Tauri、桌面脚本和未来桌面 UI 均归这里维护。
- 当前 Desktop 的前端产物暂时复用 Web 应用入口，构建、Rust 原生层和打包 target 已独立；未来替换为桌面专属界面时不改变 Web 项目边界。
- 桌面端可以依赖 `@aiao-media/*` 和 RxDB 公共包，不能反向依赖 Web 的运行时 target。
- 保持现有 RxDB、SQLite、OPFS、文件目录和 profile 标识兼容，不删除本地用户数据。
- 运行任务使用 `pnpm nx run aiao-media-desktop:<target>`。
- 不提交 API Key、账号会话、本地 `.env` 或生成的 Tauri target/gen 文件。
