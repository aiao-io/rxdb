# `dev-rxdb-electron` 代码评审

## 结论

🟡 凑合。Electron 安全基线基本正确，但生产 `file:` 导航白名单形同虚设，OPFS 清理失败会阻断 IDB 降级，端口参数也缺少严格校验。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：`apps/dev-rxdb-electron` 下 Angular renderer、Electron main/preload、wa-sqlite 初始化、测试和 Nx/打包配置
- 自动校验：本轮仅完成只读代码审查，未为该项目单独运行 `lint`、`build`、Electron 打包或自动测试
- 测试现状：已有 OPFS 成功与回退路径测试，但未覆盖生产 `file:` 导航和“连接、清理同时失败”的恢复路径

## 问题

| ID | 级别 | 位置 | 问题与影响 | 建议 |
| --- | --- | --- | --- | --- |
| ELECTRON-001 | P2 | `src-electron/main.ts:47` | `will-navigate` 用 URL `origin` 判断同源。生产入口是 `file:`，所有文件 URL 的 `origin` 都是 `null`，因此任意本地 `file:` 地址都会通过比较，并继续运行在注入了受信 preload 的同一个窗口中。这个白名单在生产环境实际没有边界。 | 开发模式只允许精确的本地开发服务器 origin；生产模式校验规范化后的文件路径必须位于打包后的 browser 根目录内，并默认拒绝其他 scheme、host 和文件路径。补充恶意 `file:`、编码路径及非法 URL 回归测试。 |
| ELECTRON-002 | P2 | `src/app/connect-wa-sqlite-adapter.ts:17` | OPFS `connect()` 失败后直接 `await adapter.disconnect()`。一旦 `disconnect()` 也失败，原始连接错误的上报、worker 清理后的状态确认以及 IDB fallback 全部被跳过，应用启动被清理错误截断。 | 把连接失败、资源清理和 fallback 建模为三个独立阶段；清理放入受控 `try/finally`，即使清理报错也继续尝试 IDB，并用 `AggregateError` 或结构化错误保留两类失败。增加 connect/disconnect 双失败测试。 |
| ELECTRON-003 | P2 | `src-electron/main.ts:11` | `parseInt()` 会接受 `4120junk`，空值或非数字又会产生 `NaN`；随后仍拼进 `loadURL()`。错误配置直到导航阶段才以非领域错误暴露，端口范围也完全未校验。 | 对完整字符串做十进制整数校验，限制在 `1..65535`，非法命令行参数或环境变量应在创建窗口前明确失败。 |

## 其余观察与测试缺口

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true` 且禁止 `window.open`，方向正确；导航边界必须与这些设置同等严格。
- 现有 adapter 测试只证明正常 fallback，无法证明清理异常后仍可恢复。
- 缺少打包产物上的生产模式 smoke test；仅验证开发服务器不能覆盖 `file:` 行为。

## 验收条件

- 生产窗口只能导航到打包应用目录，任意其他 `file:`、`http(s):`、编码穿越或非法 URL 均被阻止。
- OPFS 连接和清理同时失败时仍会尝试 IDB，且错误链和 worker 资源状态可观察、可测试。
- 端口参数严格拒绝尾随字符、`NaN`、小数及越界值。
- 修复后执行 `pnpm nx lint dev-rxdb-electron`、`pnpm nx build dev-rxdb-electron`、Electron main/preload 自动测试和生产打包 smoke test。
