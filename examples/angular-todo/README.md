# Angular Todo 示例

这是一个独立的 Angular 21 示例工程，用来验证 Aiao 在 Angular 环境下的最小完整链路：SQLite 本地存储、响应式查询、批量写入、撤销/重做、历史记录，以及基于 daisyUI 的基础界面。

这个例子默认依赖已经发布到 npm 的 `@aiao/*` 包，不直接消费仓库根目录下的 workspace 源码。

## 这个示例覆盖了什么

- `@aiao/rxdb` 核心实例初始化
- `@aiao/rxdb-adapter-wa-sqlite` 本地适配器接入
- 根据浏览器能力自动切换 OPFS 或 IndexedDB VFS
- Worker / SharedWorker 两套 SQLite 执行模式
- `@aiao/rxdb-angular` 的 `provideRxDB`、`useFindAll`、`useAction`
- Todo 列表、批量添加、清空已完成、全选、排序
- 历史侧栏、撤销 / 重做、虚拟滚动

## 运行方式

```bash
cd examples/angular-todo
pnpm install
pnpm start
```

默认开发地址是 `http://localhost:4200`，路由会自动跳到 `/todo`。

本目录是独立 pnpm workspace，不要在仓库根用 monorepo 安装它。

## 常用命令

```bash
# 启动开发服务器
pnpm start

# 构建
pnpm build

# 单元测试
pnpm test
```

## 关键实现说明

### 数据初始化

`src/app/setup_rxdb.ts` 会：

- 创建 `RxDB` 实例
- 注册 `Todo` 实体
- 根据 `checkOPFSAvailable()` 选择更合适的 SQLite VFS
- 为不同模式挂载 `Worker` 或 `SharedWorker`

### UI 层

`src/app/todo/todo.page.ts` 使用的是当前真实 API，而不是脚手架占位代码：

- `useFindAll(Todo, ...)` 订阅待办列表
- `useAction(...)` 包装批量添加动作
- `versionManager.history()` 提供 undo / redo 与历史记录
- Angular CDK `cdk-virtual-scroll-viewport` 负责列表虚拟滚动

### 样式层

项目启用了 Tailwind CSS 4 和 daisyUI 5，入口在 `src/styles.css`。

## 适合拿来做什么

- 快速验证 Angular 集成是否符合预期
- 作为本地优先 Todo 示例的起点
- 对照阅读 `@aiao/rxdb-angular` 的 hooks / signals 用法

如果你要看仓库里直接消费 workspace 源码的演示，请回到根目录运行 `apps/dev-rxdb-angular`。
