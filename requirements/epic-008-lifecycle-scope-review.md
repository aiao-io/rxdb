# Epic 008 生命周期作用域评审建议

> **状态：第一轮（已吸收，不再作为开工判据）。**  
> R-001～R-008 已写入现行 US-013 / US-014 / US-015。对照修订后文本 + 源码的裁决见 [第二轮](epic-008-lifecycle-scope-review-2.md)。本文件保留，供故事里的 R-00x 引用溯源。

**评审日期**：2026-08-15  
**评审对象**：

- [Epic 008 生命周期作用域](epics/epic-008-lifecycle-scope.md)
- [US-013 EffectScope 生命周期作用域原语](stories/core/US-013-effect-scope-primitive.md)
- [US-014 插件作用域契约](stories/core/US-014-plugin-scope-contract.md)
- [US-015 插件依赖声明与按需装卸](stories/core/US-015-plugin-inject-dependency.md)

## 结论

🟡 **方向正确，实施前需要修订契约。**

`US-013 -> US-014 -> US-015` 的依赖顺序成立，不应交换。现有计划已经正确吸收 Cordis 最值得借鉴的三项能力：

1. 资源获取与释放在同一位置登记；
2. 父子作用域、逆序串行释放与异步竞态处理；
3. 依赖就绪时安装、依赖消失时释放、依赖恢复后重新安装。

计划也正确拒绝了 Proxy 追踪、动态服务注册表、通用 Loader/HMR 和直接引入 Cordis 运行时依赖。

但当前文本存在以下阻塞问题：

- 把“适配器实例已创建”误当成“适配器已连接并完成 bootstrap”；
- `inject` 声称是封闭枚举，类型却允许近似任意字符串；
- 没有冻结 `install(scope)` 半途失败后的资源回收语义；
- 没有区分插件注册生命周期、连接纪元生命周期与插件激活生命周期；
- 新增公开 `unregisterRepository()`，却声称没有改变公开 API；
- 新旧插件兼容方案可能导致双重清理；
- US-015 同时承担适配器纪元、插件拓扑、重名、环检测、失败重试和 search 迁移，INVEST 的 `Small` 不成立。

这些问题应在编码前修订。`US-013` 一旦发布，原语语义和命名就会进入 18 个 `@aiao/utils` 下游项目，不适合实现中再临时决定。

## 与既有建议对照

| 建议                             | 当前计划                                        | 结论                            |
| -------------------------------- | ----------------------------------------------- | ------------------------------- |
| 生命周期资源树                   | US-013 完整覆盖逆序、异步、嵌套、幂等和错误隔离 | 已覆盖                          |
| 插件 `install(scope)`            | US-014 覆盖旧契约兼容、四插件迁移和 graph 泄漏  | 已覆盖，但兼容判定需修正        |
| 插件依赖与按需装卸               | US-015 覆盖依赖纪元、拓扑、环检测和重装         | 已覆盖，但 readiness 定义错误   |
| 不引入 Proxy/DI/HMR              | Epic 非目标已明确                               | 已覆盖                          |
| RxDB 根生命周期收敛              | Epic 已记录，但没有 Story 认领                  | 需要补 Story                    |
| 三框架生命周期所有权             | Epic 已记录，但没有 Story 认领                  | 需要补 Story                    |
| DevTools 作用域可视化            | 明确后置                                        | 边界正确                        |
| Provider 决定 Repository         | Epic 明确排除“词法多实例隔离”                   | 应在 Epic 008 外新增 High Story |
| 不可变 session/operation context | 未覆盖                                          | 应在 Epic 008 外另立 Story      |
| 插件配置运行时校验               | 未覆盖                                          | 可后置，不应塞入 US-015         |

## 必须修正

### R-001 适配器 readiness 判据错误

**现状**

US-015 把 `localAdapter$` / `remoteAdapter$` 发出实例作为依赖就绪判据。但当前 `RxDB.init()` 先把适配器名称写进 `BehaviorSubject`，`localAdapter$` 随即通过 `getAdapter()` 创建实例。此时以下步骤尚未必完成：

- `adapter.connect()`；
- system schema migration；
- writer lease；
- 用户迁移；
- 实体建表与索引 reconcile。

真正可供插件使用的时间点在 `RxDB.connect()` 完成 adapter bootstrap、把实例加入 `#connected_adapters` 之后。search 当前先等待 `connected$`，正是因为 `localAdapter$` 本身不代表 ready。

**风险**

search 可能在主表、迁移表或 writer lease 尚未就绪时执行 FTS DDL。依赖语义会冻结一个错误时序。

**修正**

US-015 必须新增内部的“已连接资源纪元”，不能直接复用 `localAdapter$`：

```ts
type AdapterResourceState =
  | { state: 'absent' }
  | { state: 'connecting'; adapter: IRxDBAdapter }
  | { state: 'ready'; adapter: IRxDBAdapter; epoch: object }
  | { state: 'disconnecting'; adapter: IRxDBAdapter };
```

只有 `state === 'ready'` 才满足插件依赖。纪元必须使用本次已连接实例或独立 epoch token，不能只用适配器名称。

**新增 AC**

1. `localAdapter$` 已发出但 `adapter.connect()` 尚未完成时，依赖本地适配器的插件不得安装。
2. migration、建表或索引 reconcile 失败时，插件不得进入安装阶段。
3. 部分断开某个适配器时，依赖插件先释放，随后才调用 `adapter.disconnect()`。

### R-002 `inject` 不是封闭枚举

**现状**

目标类型为：

```ts
'localAdapter' | 'remoteAdapter' | Uncapitalize<string>;
```

`Uncapitalize<string>` 无法表达“已安装插件名集合”，也不能让任意字符串在编译期失败。它还允许插件名与 `localAdapter` / `remoteAdapter` 内置资源重名。

这与 US-015 AC#13 的“传任意字符串编译失败”直接矛盾。

**修正**

使用封闭类别而非伪造封闭值集合：

```ts
export type RxDBPluginDependency = 'adapter:local' | 'adapter:remote' | `plugin:${string}`;
```

这样可以做到：

- 普通任意字符串编译失败；
- 内置资源与插件命名空间不冲突；
- 第三方插件名仍可动态扩展；
- 错误信息能明确区分 adapter 缺失和 plugin 缺失。

AC#8 应改为 `inject: ['plugin:nonexistent']`。文档中的“封闭枚举”应改为“封闭依赖类别”。

### R-003 插件依赖必须在安装完成后才 active

**现状**

US-015 以“同名插件的作用域处于 active”判断插件依赖就绪。但 `EffectScope` 创建后立刻 active，`plugin.install(scope)` 可能仍在 pending。

**风险**

插件 B 依赖插件 A 时，A 尚未完成异步初始化，B 已经开始读取 A 的服务或实例属性。A 随后失败，系统进入半装状态。

**修正**

插件调度器应明确维护：

```text
registered -> waiting -> installing -> active | failed -> disposing
```

只有 `await install(scope)` 成功后才能发布插件依赖纪元。作用域 active 只是“可以登记资源”，不能替代插件 runtime active。

**新增 AC**

1. A 的 `install()` pending 时，依赖 A 的 B 不开始安装。
2. A 安装失败时，A 的作用域被释放，B 保持 waiting。
3. A 在新依赖纪元安装成功后，B 才按拓扑顺序启动。

### R-004 US-014 缺少安装失败回收语义

**现状**

US-014 覆盖正常 shutdown 和 disposer 抛错，但没有覆盖插件在登记部分 effect 后同步 throw 或异步 reject：

```ts
async install(scope: LifecycleScope) {
  scope.effect(acquireA);
  scope.effect(acquireB);
  throw new Error('install failed');
}
```

**修正**

宿主创建子作用域后，只要 `install()` 未成功完成，就必须立即释放该作用域。失败插件不得进入 active 集合。

**新增 AC**

1. 同步 throw 后，已登记 effect 逆序释放，安装错误原样传播。
2. 异步 reject 后，已登记 effect 逆序释放，安装错误原样传播。
3. 安装错误与清理错误同时发生时，两者都必须保留；清理错误不得覆盖安装错误。
4. 失败作用域进入 disposed，下一依赖纪元使用全新作用域。

### R-005 作用域层级与重连语义不清

**现状**

US-014 同时写了“实例级根作用域”和“断连重连时创建全新插件子作用域”。如果根作用域在 `#shutdown()` 时释放，它不能再创建子作用域；如果不释放，它又不是本次连接资源的所有者。

此外，现有插件存在两种不同寿命的副作用：

- search/workspace 在 factory 或构造器中向 RxDB 实例挂公开属性，寿命接近插件注册期；
- 事件监听器、BroadcastChannel、adapter 相关资源只应存活于一次激活或连接纪元。

**修正**

冻结以下层级：

```text
RxDB registration lifetime
└── connection epoch scope
    ├── adapter scopes
    └── plugin activation scopes
```

- `use()` 创建插件实例并登记永久 API facade；
- `init()/connect()` 创建 connection epoch scope；
- 每次插件安装创建 activation scope；
- 最后一个 adapter 断开时释放 connection epoch scope；
- 重连创建全新 connection epoch scope；
- 没有 `RxDB.destroy()` / `unuse()` 前，不要宣称注册期属性也已纳入自动释放。

Epic 愿景中的“实例级属性注入”应限定为“激活期实例属性”，或者新增永久销毁 Story 后再承诺完整覆盖。

### R-006 `unregisterRepository()` 是公开 API 变化

**现状**

US-014 计划新增公开 `RxDB.unregisterRepository()`，同时在 AC#13 声称“它是 RxDB 的方法，不改导出表面”。这是错误判断。API 扫描器看不见 class member 变化，不等于公开 API 没变。

**风险**

裸 `unregisterRepository()` 又创建了一组需要人工配对的公开 API，与 Epic 目标相反。

**修正**

优先使用作用域化注册：

```ts
rxdb.repository('GraphRepository', config, scope);
```

`RxDB.repository()` 内部完成：

1. 注册 config；
2. 在 scope 内登记按 config 对象身份守卫的撤销；
3. 保持原有返回 `this` 的链式行为。

这样无需公开裸反注册方法，也不存在调用方忘记配对的问题。若仍决定公开 `unregisterRepository()`，必须承认它是公开 API 变化，并增加 class member 类型契约、TSDoc 和迁移说明。

### R-007 旧新契约并存可能双重清理

**现状**

US-014 规定先释放 scope，再调用 deprecated `destroy()`。第三方插件若要同时兼容旧版和新版 RxDB，合理实现会同时提供 scoped effect 和 `destroy()`，新版宿主因此清理两次。

仅在文档中要求“不要同时使用”无法解决跨版本兼容。

**修正**

增加显式生命周期版本标记：

```ts
interface IRxDBPlugin {
  readonly lifecycle?: 'scoped';
  install(scope: LifecycleScope): void | Promise<void>;
  /** @deprecated */
  destroy?(): void | Promise<void>;
}
```

- `lifecycle === 'scoped'`：宿主只释放 scope；
- 未声明：视为旧插件，继续调用 `destroy()`；
- 新插件仍可保留 `destroy()` 给旧版宿主调用，而新版不会双重执行。

不要根据 `install.length` 判断版本，函数 arity 会被转译、绑定和压缩改变。

### R-008 US-015 不满足 INVEST Small

US-015 当前包含：

- 本地/远端 adapter 资源纪元；
- 插件名索引与重名裁决；
- plugin-to-plugin 依赖；
- 拓扑排序与逆拓扑释放；
- 环检测；
- 安装失败状态与重试纪元；
- search 自建状态机迁移；
- 公开类型、门禁和文档。

15 条 AC 不代表验收充分，更说明它不是 Small。建议拆成：

#### US-015a Adapter 依赖纪元与 search 迁移

- `adapter:local` / `adapter:remote`；
- adapter bootstrap 后发布 ready；
- 部分断开时先卸载依赖插件；
- search 去掉 `firstValueFrom(connected$)` 自等待路径；
- 同纪元失败不自动重试。

#### US-015b 插件间依赖图

- `plugin:${string}`；
- 插件名索引与重名歧义；
- 拓扑安装、逆拓扑释放；
- 环检测；
- 上游安装完成后才发布 active；
- 缺失插件依赖的诊断。

交付顺序相应调整为：

```text
US-013 -> US-014 -> US-015a -> US-015b
```

如果坚持不拆，至少应删除 US-015 的 INVEST `Small` 勾选，并按跨模块中型重构估算和验证。

## US-013 建议补充

### 命名在发布前重新裁决

`EffectScope` 与 Vue 的 `EffectScope/effectScope()`、Angular 的 `effect()` 概念直接撞名。这里管理的是资源所有权，不是响应式 effect。

推荐名称顺序：

1. `LifecycleScope`；
2. `ResourceScope`；
3. 保留 `EffectScope`，但必须在三框架包中统一 alias 并说明差异。

对应方法可考虑 `acquire()` / `acquireAsync()` / `child()`，比 `effect()` / `effectAsync()` / `scope()` 更直接。命名一旦进入 `@aiao/utils` 主入口就不应轻易改。

### 异步获取增加取消出口

当前 `effectAsync()` 只能等待 pending setup settle。如果底层打开操作永不返回，`dispose()` 会永久挂起。

建议签名允许 `AbortSignal`：

```ts
scope.effectAsync(async signal => {
  const resource = await open({ signal });
  return () => resource.close();
});
```

开始 disposing 时先 abort，再等待 setup settle 和迟到 disposer。上游不支持取消时仍保留现有等待语义。

### 冻结手动 disposer 失败语义

建议规定：手动 disposer 在调用底层清理前就从 scope 清单摘除并标记执行。即使底层抛错，后续手动调用或父 scope 释放也不重试，避免部分清理被重复执行。

还需增加两类测试：

- pending setup 在 disposing 期间 reject，而不是返回 disposer；
- 子 scope 独立 dispose 失败后仍从父 scope 摘除，父 scope 不重复释放它。

## 建议新增 Story

### US-016 RxDB connection scope 与 shutdown 收敛

认领 Epic 当前没有 Story 承接的目标：

- `#shutdown()` 的手工状态复位；
- Gateway、VersionManager、EntityManager 和事件监听器的连接期资源；
- `#event_initialized` 守卫；
- connection epoch scope 的创建、释放与重连；
- 最后一个 adapter 断开和部分 adapter 断开的不同语义。

前置建议为 US-015a/015b 全部完成，避免调度器接入后再次重写 shutdown。

### 三框架宿主作用域 Story

不要替换 Angular `DestroyRef`、React `useEffect` cleanup、Vue `onScopeDispose`。它们是正确的上游生命周期入口，应由它们调用统一 scope 的 `dispose()`。

Story 必须先定义所有权：

- factory 创建的 RxDB 由 Provider 拥有，卸载时释放；
- 外部传入的 RxDB 默认借用，卸载时不自动断开；
- 三框架提供同语义的显式 owned/borrowed 选项；
- 不能因为一个子树卸载而断开其他子树仍在使用的共享数据库。

> 下列两项的完整停车位（含 Cordis 对照后补的 P-001～P-007）见 [epic-008-out-of-scope.md](epic-008-out-of-scope.md)。本节保留第一轮原文，不另开故事。

### Epic 008 外：Provider 到 Repository 的多数据库绑定

当前基础查询 hook 通过 Entity 静态方法找 Repository，不读取 Provider 中的 RxDB。`makeRxDBProvider()` 虽能隔离 context，却不能让 `useFind()` 等 hook 选择对应数据库。

该问题属于作用域可见性，不属于资源存活期，Epic 008 排除它是正确的。但应单独登记 High Story：

- 同一 Entity class 同时注册两个 RxDB；
- 两个 Provider 子树分别查询自己的 Repository；
- Angular/React/Vue 同功能同 API；
- Entity 静态 API 保留为单数据库快捷入口，多实例时继续 fail-fast。

### Epic 008 外：不可变 operation context

`rxdb.context = { userId }` 是全实例可变状态。建议后续提供 `db.session(context)` 或显式 `OperationContext`，在事务、写入和同步入口快照并向下传递。`clientId` 应与业务身份拆开，由引擎内部持有。

## 推荐交付顺序

```text
1. 修订 US-013 契约与命名
2. 实现 US-013，并用纯内存测试冻结语义
3. 修订并实现 US-014，先证明失败安装会完整回收
4. 实现 US-015a：adapter readiness + search 迁移
5. 实现 US-015b：plugin-to-plugin 依赖图
6. 实现 US-016：connection scope + shutdown 收敛
7. 接入三框架宿主所有权
8. 最后增加 DevTools scope snapshot
```

Provider 到 Repository 的多数据库绑定与 Epic 008 独立，可以并行设计，但三框架实现仍必须一次交付，不能只修一端。

## 实施门槛

每个 Story 开工前先写失败测试。除既有覆盖率要求外，至少冻结以下契约：

- 逆序且串行释放；
- pending acquire 与 dispose 竞态；
- 安装半途失败回收；
- adapter bootstrap 前插件绝不安装；
- 部分 adapter 断开时的依赖释放顺序；
- 插件依赖只在上游安装成功后激活；
- 环检测不进入半装状态；
- 断开重连使用全新 epoch scope；
- 旧插件、scoped 插件与双版本插件各自只清理一次；
- 同一 Entity class 的三框架多 Provider 隔离。

复杂度不要再按“几个 Map + 一个拓扑排序”估计。真实难点是异步状态转移、错误出口、重连和用户可见兼容性，测试量应高于实现量。
