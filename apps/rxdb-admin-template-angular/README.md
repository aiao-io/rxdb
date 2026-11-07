# RxDB Admin Angular 应用模板

`rxdb-admin-template-angular` 是模型驱动本地数据工作台的 Angular 版本，与 React 模板使用同一套功能和浏览器验收场景：资产、分类、维护记录，模型驱动录入 / 编辑 / 筛选，全文搜索，备份恢复，以及后台外壳的主题、页签、命令面板、锁屏与中英文。

在仓库根目录执行，环境要求沿用根 `package.json`：

```bash
pnpm install
pnpm nx serve rxdb-admin-template-angular
pnpm nx run rxdb-admin-template-angular:lint
pnpm nx run rxdb-admin-template-angular:typecheck
pnpm nx run rxdb-admin-template-angular:test
pnpm nx run rxdb-admin-template-angular:build
pnpm nx run rxdb-admin-template-angular-e2e:e2e --workers=2
```

开发地址为 `http://127.0.0.1:4207`。默认数据库为 `admin-workbench-ng`，偏好前缀为 `aiao.workbench.angular`，三端数据互不覆盖。恢复备份必须先进入首页的「从备份恢复」，不能先打开实体列表或搜索页初始化目标库；清理失败后可继续重试。

| 定制内容                                           | 入口                                                        |
| -------------------------------------------------- | ----------------------------------------------------------- |
| 品牌、中英文标题、数据库名、偏好前缀、可见命名空间 | [app.config.json](app.config.json)                          |
| 样例实体与注册列表                                 | [asset-entities.ts](src/app/entities/asset-entities.ts)     |
| 可见实体与实体查找                                 | [entity-registry.ts](src/app/entities/entity-registry.ts)   |
| 懒加载页面与路由                                   | [app.routes.ts](src/app/app.routes.ts)                      |
| 导航与图标                                         | [workbench-menu.ts](src/app/shell/workbench-menu.ts)        |
| 外壳偏好、主题与旧键迁移                           | [workbench-shell.ts](src/app/shell/workbench-shell.ts)      |
| 中英文目录与模型字段文案                           | [i18n](src/app/i18n/)                                       |
| 本地数据库、历史与搜索插件                         | [setup_rxdb.ts](src/app/rxdb/setup_rxdb.ts)                 |
| 备份恢复互斥、错误与清理状态                       | [backup-controller.ts](src/app/backup/backup-controller.ts) |

修改已有应用的数据库名和偏好前缀需要数据迁移方案。替换样例实体时同步检查关系、可搜索字段及中英文目录；主题清单与 `src/styles.css` 保持一致。

数据库沿用 sqlite-wasm 主线程 + IndexedDB，满足浏览器备份恢复和 FTS5 搜索。外壳在连接数据库之前初始化，导航计数只在数据库连接后挂载，保留空库恢复入口。

三端共用 [浏览器验收](../rxdb-admin-template-react-e2e/src/)，每端的 Nx e2e 目标负责构建并启动自己的生产产物。应用级需求与边界参见 [模板需求](../rxdb-admin-template-react/requirements/README.md)；当前仍在本仓库内孵化，不提供独立仓库导出流程。

Angular 使用独立组件、signals、懒加载路由与 `@angular/build:application`。`prepare-html` 从应用配置生成 `.generated/index.html` 和首屏主题恢复脚本，`serve` / `build` 自动执行；请修改根 `index.html` 模板。
