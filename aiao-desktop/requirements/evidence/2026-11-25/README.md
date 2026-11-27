# 2026-11-25 验收证据

## ADESK-US-131 设置里的退出与重置本地数据

- 提交：55ca51991（功能）、18668267a（头像改入账户详情页，最终形态）；格式与文档修订 2d44bae69 / e5d83a1d5 / 45c44c75d
- 日期：2026-11-25
- 环境：本机（darwin）、Node v26.12.0、桌面 Chromium（Playwright，无 GPU 断言）
- 命令：`node src/smoke.mjs --group=settings-workflow --parallel=1 --report=sign-out.json`
- 产物：[sign-out.json](sign-out.json)（正式构建 `dist/aiao-desktop/apps/web/browser`，外网请求全部拦截）

检查项全部通过：`accountMenu`（点头像进入 Apple Account 详情页）、`accountMenuKeyboard`（Enter 进入账户页）、`signOutConfirmCancel`（确认文案与取消）、`signOutErasesAndReloads`（确认后刷新回全新桌面、已持久化的静音回到默认）。

AC 5（localStorage 不可用仍能抹除）由 web 单测覆盖：`desktop-erase.spec.ts` 与 `desktop-data.spec.ts`，命令 `pnpm nx test aiao-desktop-web --skip-nx-cache`。
