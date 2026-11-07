# 插件与扩展能力

核心包负责模型、查询与写入，历史、同步、搜索和领域能力通过独立包接入。需要 `rxdb.use()` 的插件应在首次数据库初始化或连接之前安装；具体实体、适配器与插件依赖以各自指南为准。

| 能力     | 指南                                                 | 作用                                            |
| :------- | :--------------------------------------------------- | :---------------------------------------------- |
| 历史     | [history](./rxdb-plugin-history/README.md)           | 操作历史与分支能力                              |
| 同步     | [sync](./rxdb-plugin-sync/README.md)                 | 远端 push / pull 与同步编排                     |
| 查询缓存 | [querycache](./rxdb-plugin-querycache/README.md)     | 远端查询的本地缓存与离线读取                    |
| 全文搜索 | [search](./rxdb-plugin-search/README.md)             | SQLite FTS5 或 PGlite pg-tsvector，按适配器放行 |
| 工作树   | [working-tree](./rxdb-plugin-working-tree/README.md) | 隔离编辑、差异与合并                            |
| 回放     | [replay](./rxdb-plugin-replay/README.md)             | 历史会话与回放状态                              |
| 树       | [tree](./rxdb-plugin-tree/README.md)                 | 树结构与三框架绑定                              |
| 图       | [graph](./rxdb-plugin-graph/README.md)               | 图实体与关系查询                                |
| 工作空间 | [workspace](./rxdb-plugin-workspace/README.md)       | 工作空间与成员模型                              |
| 文件存储 | [storage](./rxdb-plugin-storage/README.md)           | 文件元数据与存储接入                            |
| 单人看板 | [board](./rxdb-plugin-board/README.md)               | 看板领域服务、三框架视图与备份外壳；尚未发布    |
| 文件直传 | [p2p](./rxdb-plugin-p2p/README.md)                   | 已认证的设备会话与分块文件传输；尚未发布        |

[客户端国际化](../i18n/README.md)是独立运行时，可静态使用，也可选用 RxDB 持久化。它不需要通过 `rxdb.use()` 注册。自行开发插件时，先阅读[编写插件](./authoring.md)的生命周期与错误处理约定。
