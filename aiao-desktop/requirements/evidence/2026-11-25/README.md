# 2026-11-25 验收证据

## ADESK-US-131 设置里的退出与重置本地数据

- 提交：工作树 012-web-desktop-product（HEAD 12dc058ec，未提交的新改动）
- 日期：2026-11-25
- 环境：本机（darwin）、Node v26.12.0、桌面 Chromium（Playwright，无 GPU 断言）
- 命令：`node src/smoke.mjs --group=settings-workflow --parallel=1 --report=sign-out.json`
- 产物：[sign-out.json](sign-out.json)（正式构建 `dist/aiao-desktop/apps/web/browser`，外网请求全部拦截）

检查项全部通过：`accountMenu`（点开账户菜单）、`accountMenuKeyboard`（Enter 打开接管焦点、Esc 关闭回到头像行，Playwright 合成事件）、`signOutConfirmCancel`（确认文案与取消）、`signOutErasesAndReloads`（确认后刷新回全新桌面、已持久化的静音回到默认）。

AC 5（localStorage 不可用仍能抹除）由 web 单测覆盖：`desktop-erase.spec.ts` 与 `desktop-data.spec.ts`，命令 `pnpm nx test aiao-desktop-web --skip-nx-cache`。
