# rxdb-devtools-panel

This library was generated with [Nx](https://nx.dev).

## Running unit tests

Run `nx test rxdb-devtools-panel` to execute the unit tests.

## I18n 检视

`/i18n` 复用平台中立的 v2 endpoint，展示当前语言、所有目录层及缺失 key。仅在 connector 明确声明 `canClearMissing` 时显示诊断清空按钮；清空请求始终限定为 `{ scope: 'i18n-missing' }`。会话切换或销毁时解除事件监听，迟到的旧响应不会覆盖当前页面。
