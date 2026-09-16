# 工作树拆包：核心 → `@aiao/rxdb-plugin-working-tree`

工作树与提交历史（epic-006）从 `@aiao/rxdb` 核心抽成了独立插件包，**下一个发布版本起**生效：十张系统表、写捕获、提交图编解码、`0004-working-tree-commits` 迁移全部随 `@aiao/rxdb-plugin-working-tree` 走，核心侧只留下装卸口与「未认领能力守卫」。

**不涉及数据迁移。** 磁盘上的库文件、表结构、`rxdb_change` 链、已经写进 `rxdb_migration` 的迁移名——一样都没动。要改的只有依赖清单、一行 `use()`、以及（对用过工作树的库）一次 `enable()` 收敛。按[版本与 API 稳定性策略](../versioning.md)，0.x 期间次版本即可包含破坏性变更。

## 为什么拆

工作树是「装上才存在」的能力：十张表与一层写捕获，对不用它的库来说全是成本。拆出之前，这些成本由核心包承担，而且核心只能用抬升 `RXDB_SYSTEM_SCHEMA_VERSION` 来锁住旧客户端——一次工作树侧的小改也要让**所有**旧客户端拒绝连接，不装这功能的库跟着一起被锁。

拆出之后：未装本包的库**零成本**——系统表、捕获与编解码全部随包走；锁旧客户端由「未认领能力守卫」接管，只锁**启用过该能力**的库（见第 4 节），且对第三方插件同样有效。

## 1. 安装

```bash
pnpm add @aiao/rxdb-plugin-working-tree
# 框架绑定（按需选其一）
pnpm add @aiao/rxdb-plugin-working-tree-angular
pnpm add @aiao/rxdb-plugin-working-tree-react
pnpm add @aiao/rxdb-plugin-working-tree-vue
```

不打算用工作树的应用**不需要装**，也不会有任何行为差异。

## 2. `use()` 必须排在 `connect()` 之前

这是唯一一处运行期可见的接入变化：

```typescript
import { RxDB } from '@aiao/rxdb';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';

const db = new RxDB(config);
db.use(rxDBPluginWorkingTree); // ← 必须在 connect() 之前
await db.connect('sqlite-wasm');
```

本插件声明 `system`（`RxDBSystemContribution`），宿主要在建表之前读走它的实体、初始行与迁移；`connect()` 之后再 `use()` 已经赶不上建表，核心会当场抛错而不是静默跳过。

类型入口也随之变化：`db.workingTree` 是**非可选**成员，由 `declare module '@aiao/rxdb'` 增广而来——没装本包时 `db.workingTree` 是**编译错误**，而不是运行期的 `undefined`。装没装插件是构建期属性，能不能用才是数据库的属性。

## 3. 既有库：`enable()` 收敛一次

连接之后调用一次 `db.workingTree.enable()`——**幂等**，既有库与新库同一条调用路径：

```typescript
await db.workingTree.enable();
```

它的语义是「把库收敛到已启用该有的形状」：翻 `CommitCapabilityState` 的能力位，并给每条本地分支补上提交图根节点（同一个事务）。已启用过的库重复调用是一条语句都不发的 no-op。迁移抛错时整笔回滚，能力位退回未启用，重试面对的还是同一个起点。

拆包前已经跑过 `0004-working-tree-commits` 的库**不会重跑**：那条迁移的名字是发布时就钉死的历史编号（当时它还长在核心里），`rxdb_migration` 的唯一索引拿它当仲裁键，名字永不能改。没跑过的老库（比工作树更早的版本建的）在 `connect()` 时由插件贡献的迁移链补跑。

## 4. 未认领能力守卫取代版本号锁

升级并 `enable()` 之后，库里多出一行能力水位（`__rxdb_capability__:workingTree:1:@aiao/rxdb-plugin-working-tree`）。**此后没装本包的客户端再打开这个库，核心拒绝连接**，并把该装的包名原样报出来：

```
这个数据库启用了当前进程未认领的 RxDB 能力，缺少对应插件时写入不受该能力管辖，因此拒绝连接：
  - workingTree v1 —— 安装 @aiao/rxdb-plugin-working-tree
```

行为对比（旧 → 新）：

| 场景                                   | 旧（核心内置 + 版本号锁）         | 新（插件 + 能力守卫）                       |
| -------------------------------------- | --------------------------------- | ------------------------------------------- |
| 工作树侧任何改动                       | 抬升 `RXDB_SYSTEM_SCHEMA_VERSION`，**所有**旧客户端被锁 | 只锁启用过该能力的库                         |
| 没装插件的客户端打开启用过的库         | 靠版本号恰好挡住（顺带挡住一切）  | 点名拒绝并报出该装的包名                     |
| 从未启用工作树的库，客户端不装插件     | 行为不变                          | **零成本**：不建表、不装捕获、无守卫触发     |
| 第三方插件同样需要锁旧客户端           | 无此机制                          | 包名由插件自己写进水位行，核心不需要认识它   |

> 部署多端应用时注意：只要有一个客户端 `enable()` 过，**所有**打开同一个库的客户端（含旧版本 bundle）都必须装上本插件并先 `use()`，否则连接被守卫拒绝——这正是守卫接替版本号锁的本意。

## 5. 框架绑定

三端 `useWorkingTree()` **同名、同字段、同方法签名**，只有状态容器形态不同（`Signal` / 渲染快照 / `ComputedRef`）：

| 框架    | 包                                        | 入口            |
| :------ | :---------------------------------------- | :-------------- |
| Angular | `@aiao/rxdb-plugin-working-tree-angular`  | `useWorkingTree()` |
| React   | `@aiao/rxdb-plugin-working-tree-react`    | `useWorkingTree()` |
| Vue     | `@aiao/rxdb-plugin-working-tree-vue`      | `useWorkingTree()` |

装插件仍在库侧完成（`db.use(rxDBPluginWorkingTree)`），绑定包只负责读写。七个状态字段的初值全是 `idle`（创建入口一次 IO 都不发），类型与错误类一律从插件包直接 import。

## 参考

- [工作树与提交历史插件](../plugins/rxdb-plugin-working-tree/README.md)：完整用法与 API
- [插件作用域契约迁移](./plugin-scope.md)：`install(scope)` 新契约与本插件 `lifecycle: 'scoped'` 的含义
- [版本与 API 稳定性策略](../versioning.md)：废弃周期与公开 API 范围
- [兼容矩阵](../compatibility.md)：框架版本与 RxJS 版本对应关系
