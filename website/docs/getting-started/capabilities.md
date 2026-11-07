# 能力与示例

网站按当前 main 的实现组织。核心读写、框架绑定和完整应用示例分别有独立入口。Admin、I18n、Board 与 P2P 包族目前属于工作区新增能力，尚未进入 npm 发布集合；先从本页命令运行仓库示例。发布包的接入条件见[兼容矩阵](../compatibility.md)。

## 按需求接入

| 需求                         | 入口                                                       | 当前边界                                                                    |
| :--------------------------- | :--------------------------------------------------------- | :-------------------------------------------------------------------------- |
| 本地 SQL、事务与响应式查询   | [快速开始](./README.md)、[适配器](../adapters/README.md)   | 按宿主与适配器选择持久化方式；wa-sqlite 默认使用 IDB                        |
| 元数据生成表单、列表与详情   | [实体模型](../entity-model/README.md)                      | 默认 UI 使用宿主样式管线与展示依赖                                          |
| 自定义控件与布局             | [Headless 实体能力](../entity-model/headless.md)           | 六类控制器与三框架绑定已提供；默认组件迁移及历史、手动排序仍有未完成范围    |
| 后台导航、布局与用户偏好     | [后台外壳](../admin-shell/README.md)                       | 复用实体模型 UI；Angular、React、Vue 具有对应外壳与模板                     |
| 多语言文案、数字与日期格式化 | [客户端国际化](../i18n/README.md)                          | ICU 与完整 `Intl.*`；可静态使用或把偏好、目录存入 RxDB，小程序未支持        |
| 单人任务看板                 | [任务看板](../plugins/rxdb-plugin-board/README.md)         | 三框架视图、拖放、筛选、历史与备份；完整宿主首轮支持 sqlite-wasm 主线程 IDB |
| 局域网文件共享               | [P2P 会话与文件共享](../plugins/rxdb-plugin-p2p/README.md) | 已认证会话与文件协议；应用接入发现、信令、认证与字节存储                    |
| 分支、撤销重做与远端同步     | [数据协作](../collaboration/README.md)                     | 按需安装插件；P2P 文件传输与数据库 push / pull 是独立能力                   |

## 本地运行示例

先按仓库根 README 安装依赖，再从根目录运行：

```bash
# 三框架综合演示
pnpm nx serve dev-rxdb-angular
pnpm nx serve dev-rxdb-react
pnpm nx serve dev-rxdb-vue

# 单人任务看板
pnpm nx serve dev-rxdb-board

# 三框架后台模板
pnpm nx serve rxdb-admin-template-angular
pnpm nx serve rxdb-admin-template-react
pnpm nx serve rxdb-admin-template-vue

# P2P 会话与文件共享验证
pnpm nx serve dev-rxdb-p2p
```

[在线演示](/demos)部署三框架综合应用。上面的独立看板、后台模板与 P2P 验证应用从仓库本地启动，具体运行条件见各能力文档。

HTTP 演示还提供 `?i18n=1` 页面，用于验证远端目录缓存、离线翻译与恢复查询；服务端与本地适配器配置见 [HTTP 适配器](../adapters/http.md)。
