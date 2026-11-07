# 完整客户端国际化本地验收

日期：2026-11-06。范围为 [ADMIN-US-003](../stories/platform/ADMIN-US-003-client-i18n.md)，状态和 AC 以故事为准。

## 目标行为

- 同一个运行时翻译外壳、应用页面、模型组件、实体显示名和无障碍文案。
- 刷新恢复语言、同源 Tab 联动，已打开页签与表单更新时保留业务值及输入。
- 备份恢复错误按当前语言显示；首页切换语言并刷新不破坏空库恢复前置。

## 验证记录

| 层级           | 命令或入口                                                              | 当前证据                                                               |
| -------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 需求一致性     | `pnpm nx run rxdb-admin-template-react:requirements-check`              | 通过，0/5 已交付，状态与引用一致                                       |
| 需求门禁夹具   | `pnpm nx run rxdb-admin-template-react:requirements-test`               | 41 条通过                                                              |
| 静态检查       | 应用与受影响公共包的 lint / typecheck                                   | 待执行                                                                 |
| 行为单测       | 应用 i18n、导航、显示元数据和备份错误测试                               | 待执行                                                                 |
| 实际构建       | `pnpm nx run rxdb-admin-template-react:build`                           | 待执行                                                                 |
| 中英文浏览器   | [i18n.spec.ts](../../../rxdb-admin-template-react-e2e/src/i18n.spec.ts) | 已新增五个场景；旧产物红测在切换后的英文首页标题断言失败，待实现后复验 |
| 原有浏览器路径 | 应用 e2e 的资产、搜索、偏好、备份恢复与无障碍场景                       | 待执行                                                                 |

首次浏览器红测运行 `pnpm nx run rxdb-admin-template-react-e2e:e2e-ci--src/i18n.spec.ts --workers=1 --max-failures=1`，使用变更前构建产物，切换 English 后仍无英文首页标题，按预期失败。新增 E2E 的 `lint --max-warnings=0` 已通过；其余代码检查与绿色浏览器结果待补。

## 证据边界

本记录只证明当前 workspace 的 Web 应用接入。业务内容翻译、远端目录、独立仓库消费及小程序不属于本次验证。平台已有测试不能代替这些应用行为的实际运行结果。
