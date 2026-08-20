# 编写插件

插件在 `install()` 里拿到一个**本次连接纪元专属**的作用域（`LifecycleScope`）。每登记一处宿主改动，就在作用域上 `acquire()` 一条撤销条目；断开连接时宿主按逆序串行释放它们。插件因此不需要自己维护「装了什么、该拆什么」的清单，也不需要终态标记。

## 契约

```typescript
import type { IRxDBPlugin, Plugin, RxDB } from '@aiao/rxdb';
import { RxDBPluginBase } from '@aiao/rxdb';
import type { LifecycleScope } from '@aiao/utils';

export class RxDBPluginExample extends RxDBPluginBase implements IRxDBPlugin {
  /** 声明本插件已迁移到作用域拆卸；宿主释放完作用域就收手，不再调用 destroy() */
  readonly lifecycle = 'scoped' as const;

  /** 插件名，用于日志与宿主侧的错误归因，同时决定作用域标签 `plugin:example` */
  readonly name: Uncapitalize<string> = 'example';

  install(scope: LifecycleScope): void | Promise<void> {
    // 在这里登记本纪元的全部宿主改动与外部资源
  }
}

export const rxDBPluginExample: Plugin = (db: RxDB) => new RxDBPluginExample(db);
```

| 成员             | 必需 | 说明                                                                                      |
| ---------------- | ---- | ----------------------------------------------------------------------------------------- |
| `name`           | ✅   | 插件名（首字母小写）                                                                      |
| `install(scope)` | ✅   | 建立本纪元资源；抛错或 reject 视为安装失败                                                |
| `inject`         | ⬜   | 声明依赖；全部就绪后宿主才调 `install()`，未满足则一次都不调                              |
| `lifecycle`      | ⬜   | 取 `'scoped'` 表示拆卸完全交给作用域                                                      |
| `destroy?()`     | ⬜   | 已废弃。仅为尚未迁移的插件保留，未声明 `lifecycle` 时宿主会在释放作用域**之后**再调用一次 |

实现方不写形参不破坏契约——`install()` 与 `install(scope)` 同样满足接口。

## 在作用域上登记

`scope.acquire(setup, label)` 立即执行 `setup()`，把它返回的清理函数记进清单，并返回一个可提前撤销这一条的句柄。

```typescript
install(scope: LifecycleScope) {
  scope.acquire(() => {
    const channel = new BroadcastChannel('example');
    return () => channel.close();
  }, 'example:channel');

  scope.acquire(() => {
    const onCreate = (event: EntityEvent) => this.#handle(event);
    this.rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, onCreate);
    return () => this.rxdb.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, onCreate);
  }, 'example:entity-create');
}
```

`label` 只用于诊断（`scope.getEntries()` 与错误信息），但请认真写：拆卸报错时它是唯一能指认「哪一条没退干净」的线索。

宿主 API 若接受作用域，直接把 `scope` 递进去，不用自己包一层：

```typescript
install(scope: LifecycleScope) {
  // 断开连接时这条注册跟着一起撤销
  this.rxdb.repository('GraphRepository', config, scope);
}
```

### 一次 `acquire()` 只包一步可能抛错的获取

这是硬约束，不是风格建议。`setup()` 抛错时这一条**不会**进入清单，它内部已经造出来的东西宿主够不着，必然泄漏。

```typescript
// ❌ open() 成功、subscribe() 抛错 —— store 泄漏，没人关得掉它
scope.acquire(() => {
  const store = openStore();
  const sub = source$.subscribe(handler); // 抛错则 store 已经开着了
  return () => {
    sub.unsubscribe();
    store.close();
  };
}, 'example:everything');

// ✅ N 个资源写 N 次 acquire()，第二步失败时第一步已经在清单里
scope.acquire(() => {
  const opened = openStore();
  this.#store = opened;
  return () => {
    this.#store = undefined;
    opened.close();
  };
}, 'example:store');
scope.acquire(() => {
  const sub = source$.subscribe(handler);
  return () => sub.unsubscribe();
}, 'example:subscription');
```

`setup()` 只返回**清理函数**，或返回 `undefined` 表示这一步无需清理。需要在别处用到造出来的值时，在 `setup()` 里赋给实例字段，并在清理函数里把字段复位——字段的有无就是「本纪元装没装」，不需要额外的布尔量。

`acquire()` 的返回值是**提前单独撤销这一条**的句柄，不是资源本身；不需要提前撤销就忽略它。

### 子作用域

一组资源要能整体提前释放时，开一个子作用域：`scope.child('example:session')`。释放父作用域会连带释放它，无需手工记账。

## 构造函数与 `install()` 的分工

- **构造函数**只做注册期的事：发布**摘不掉**的身份属性（如 `rxdb.workspace`）、读取 options。这些跨纪元复用，同一个实例要能挺过断开重连。
- **`install()`** 建立本纪元资源：IndexedDB store、BroadcastChannel、订阅、事件监听器。全部按作用域条目登记。

改造前这些资源在构造函数里建、靠一段手写的 `rollback()` 序列回滚；现在获取与释放成对写在同一处，回滚由作用域负责。

作用域**不跨纪元复用**：`disconnectAll()` 之后重新 `connect()`，`install()` 会收到一个全新的作用域实例。把它存到实例字段上跨纪元读，读到的是已释放的旧对象。

## 安装失败

`install()` 抛错（含 Promise reject）视为安装失败。宿主会先把**已经登记进 `scope` 的部分**逆序释放掉，再把原错误传播给 `connect()`。回滚期间的清理错误只记日志，不会盖掉安装错误。

插件自己**不要**在 `install()` 的 catch 里做补偿性清理——清单在宿主手里，重复清理只会把幂等性问题引进来。

## 声明依赖，不要自己等

需要适配器才能干活的插件，用 `inject` **声明**依赖，由宿主决定装载时机：

```typescript
class ExampleSearchPlugin implements IRxDBPlugin {
  readonly name = 'exampleSearch';
  readonly inject = ['adapter:local'] as const;
  readonly lifecycle = 'scoped' as const;

  install(scope: LifecycleScope) {
    // 被调用即代表依赖就绪：引导链（迁移、建表、索引）已经跑完
    const adapter = this.rxdb.localAdapterSync;
    scope.acquire(() => { /* 同步登记 */ }, 'example:entry');
    return this.#setup(adapter);
  }
}
```

`inject` 的取值是一个封闭集合：`'adapter:local'`、`'adapter:remote'`、`` `plugin:${string}` ``（首字母小写的插件名）。写错会**编译失败**，不会退化成运行时的静默跳过。

`plugin:*` 属于阶段 B，尚未实现解析：现在声明它等同于「依赖永远不满足」，插件不会被安装，控制台会有一条警告。想表达插件之间的先后，暂时仍靠**注册顺序**——`use()` 的调用序就是安装序，见 [US-015](https://github.com/aiao-io/rxdb/blob/main/requirements/stories/core/US-015-plugin-inject-dependency.md)。

### 依赖没满足会怎样

- 插件**不安装**，也不会拿到作用域——`install()` 一次都不调；
- 控制台按插件**只警告一次**，不会每轮调度刷屏；
- `connect()` **照常 resolve**：它只等真正开工了的安装。等一个永远等不到依赖的插件会把整个连接拖死，所以宿主不等。

也就是说，`await db.connect()` 返回不代表你的插件装上了。要确认装没装，读插件自己的就绪信号（例如搜索插件的 `ready`）。

### 依赖变了会重装

依赖的纪元身份按**实例引用**判定，不是按名字。断连重连拿到同名但不同实例的适配器，算一次纪元变化：宿主先释放旧作用域，再用新实例重装一轮。所以 `install()` 必须能被同一个实例调用多次，每轮只认自己收到的那个 `scope`。

同一纪元内安装失败**不会自动重试**——重试的唯一触发点是纪元变化。

### 不要在 `install()` 里等宿主连接

`connect()` 的顺序是「适配器就绪 → `await` 全部插件的 `install()`」。所以 `install()` 里 `await db.connect()` 是在等自己：

```diff
 install(scope: LifecycleScope) {
-  return db.connect().then(() => this.#setup());   // 死锁：connect() 正在等这个 promise
+  const adapter = db.localAdapterSync;             // 声明 inject 之后，被调用即代表已就绪
+  return this.#setup(adapter);
 }
```

声明了 `inject` 就**不要**再自己等依赖了——不要 `db.connect()`，不要订阅 `db.adapterConnected$(name)`，也不要 `await` 另一个插件的就绪 promise。这些等待在依赖调度落地之前是唯一的办法，现在它们只会把已经解掉的死锁重新绑回去。

## 跨纪元的迟到任务

`install()` 启动的异步任务可能跨越一次断开重连。每个 `await` 之后、**写实例字段或结算等待者之前**，先复核纪元身份还是不是自己那一轮：

```typescript
const store = this.#store;
const rows = await read(store);
if (this.#store !== store) return; // 纪元已换：结果只能丢弃
this.#rows = rows;
```

比对的是**身份**而不是「是否为 `undefined`」：读取期间断开又重连时字段已经有值了，那份值属于新纪元，不该由这一轮补写。没有稳定字段可比时，把 `install()` 收到的 `scope` 存成字段：它天然一纪元一个，`scope.state` 还顺带给出「活着 / 释放中 / 已释放」三态，不必再自己维护一个纪元号和一套状态枚举。

## 拆卸顺序

`disconnectAll()` 时宿主按**逆插入序串行**拆卸：后装的先拆。

1. 释放该插件的作用域（内部条目再按逆登记序串行释放）；
2. 若插件**未**声明 `lifecycle: 'scoped'`，补调一次 `destroy?()`。

任一步抛错只记日志，后面的插件照拆——半拆的实例比拆干净的实例危险得多，`disconnectAll()` 因此始终 resolve。

## 双版本插件

既要能装进旧宿主又要能装进新宿主时，两样都写：

```typescript
// 这里 LifecycleScope 当值用，import 不能带 type
import { LifecycleScope } from '@aiao/utils';

export class RxDBPluginDual extends RxDBPluginBase implements IRxDBPlugin {
  readonly lifecycle = 'scoped' as const;
  readonly name: Uncapitalize<string> = 'dual';

  #scope?: LifecycleScope;

  // 形参必须可选：旧宿主调的是 `plugin.install()`，一个实参都不传
  install(scope?: LifecycleScope) {
    // 旧宿主没有作用域可发，插件自己开一个；它的释放入口就是下面的 destroy()
    const epoch = scope ?? new LifecycleScope(this.name);
    this.#scope = epoch;
    epoch.acquire(/* … */);
  }

  /** @deprecated 新宿主不会调用它 */
  destroy(): Promise<void> {
    return this.#scope?.dispose() ?? Promise.resolve();
  }
}
```

旧宿主不认识 `lifecycle` 字段、只会走 `destroy()`；新宿主认识，于是只走作用域。两边都不会清理两次——`dispose()` 幂等，即便被调两次也只执行一轮。

自建的那个作用域**不要**在新宿主下也建：宿主发的作用域已经挂在连接纪元上，再包一层只会多一处要自己记得释放的东西。`scope ?? …` 的两条分支互斥，靠的就是「新宿主一定传、旧宿主一定不传」。

之所以要**显式**标记而不是去看 `install.length` 有没有形参：转译产物、`Function.prototype.bind` 与压缩器都会改写形参个数，把它当契约会误判。

## 内部状态也挂作用域

作用域的职责是撤销**宿主改动**，但插件自身的内部状态（缓存、就绪信号）同样可以挂上去——登记一条只做复位的条目就行，不必为它保留 `destroy()` 和两步拆卸：

```typescript
install(scope: LifecycleScope) {
  // 最先登记 ⇒ 逆序释放时最后跑：前面那些条目的清理函数还读得到这些状态
  scope.acquire(() => () => this.#reset(scope), 'example:state');
  this.#bindEntityEvents(scope);
}

#reset(scope: LifecycleScope) {
  if (this.#scope !== scope) return; // 旧纪元迟到的释放，不许动新纪元刚建好的状态
  this.#cache.clear();
}
```

复位函数同样要比对纪元身份，理由见上面的「跨纪元的迟到任务」。

`@aiao/rxdb-plugin-search` 走的就是这条路：entity 事件监听与状态复位都是作用域条目，插件声明 `lifecycle: 'scoped'`，拆卸只有一步。
