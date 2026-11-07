# 文档导航

RxDB 为 Angular、React、Vue 提供本地数据库、响应式查询和统一实体模型。先跑通本地读写，再按应用需求加入 UI、国际化、看板与协作能力。

- [快速开始](./getting-started/README.md)：模型、数据库、读写与 UI 绑定的最小链路。
- [能力与示例](./getting-started/capabilities.md)：当前 main 的功能边界与各应用启动命令。
- [模型定义](./model-definition/README.md)、[查询](./model-query/README.md)、[写入](./model-mutation/README.md)：核心数据 API。
- [框架集成](./frameworks/README.md)：Angular Signals、React Hooks 与 Vue Composables。
- [实体模型 UI 与 Headless](./entity-model/README.md)：默认视图和可独立消费的状态控制器。
- [后台外壳](./admin-shell/README.md)：导航、布局、主题与三框架后台模板。
- [客户端国际化](./i18n/README.md)：ICU 消息、格式化、目录与语言偏好。
- [适配器](./adapters/README.md)：浏览器、桌面、HTTP、Supabase 与小程序的存储选择。
- [插件](./plugins/README.md)：历史、同步、搜索、看板与 P2P 文件共享。
- [兼容矩阵](./compatibility.md)、[版本策略](./versioning.md)：实际 peer 要求、发布状态与迁移边界。

Admin、I18n、Board 与 P2P 包族尚未进入 npm 发布集合，请先在仓库工作区运行示例。其余包也应按发布产物与对应版本文档配套使用。
