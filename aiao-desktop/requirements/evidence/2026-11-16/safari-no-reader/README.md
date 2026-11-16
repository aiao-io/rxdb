# Safari 移除阅读模式验收（2026-11-16）

- [external-content.json](external-content.json)：正式构建、外网拦截，受控网页验证原站加载、表单、前进后退、刷新、外部打开、临时会话及桌面跨源隔离；10 项通过。
- [a11y.json](a11y.json)：既有无障碍检查及新增 Safari 链接的名称、Tab / Enter 操作和 axe 检查通过。
- [baidu-homepage.json](baidu-homepage.json)、[截图](baidu-homepage.png)：本地正式构建使用真实网络加载百度首页，标题“百度一下，你就知道”；阅读模式入口为 0，宿主仍处于跨源隔离。只证明本次首页显示，不代表全部网站、登录或搜索结果已经验收。

命令分别为 `pnpm nx run aiao-desktop-e2e:e2e --args='--group=external-content --parallel=1'`、`pnpm nx run aiao-desktop-e2e:e2e --args='--group=a11y --parallel=1'`。

`pnpm nx run-many -t lint typecheck test --projects=aiao-desktop-web,aiao-desktop-e2e --parallel=1 --skipRemoteCache` 通过。web 共 94 个测试文件、1352 条单测通过，语句覆盖率 98.61%、行覆盖率 99.31%，既有逐文件门槛通过；`aiao-desktop:requirements-check` 通过。共享工作区同时存在 PWA 改动，报告的 source.changes 原样记录被测状态。
