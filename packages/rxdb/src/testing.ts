/**
 * @fileoverview `@aiao/rxdb/testing` —— 只给测试用的入口。
 *
 * @remarks
 * 这里的东西**不进生产包的主入口**：它们依赖 `vitest`（可选 peer），并且会碰
 * `rxdb.private.js` 里的内部符号与 `QueryManager` 的构造函数——两者都不是公开契约。
 *
 * 存在的理由是「同一个测试台不要抄两份」：`merge_*` 的用例在核心与插件（树、图）两边都有，
 * 而测试台的价值恰恰在于**经真正的 `QueryManager.createTask()`** 拿任务。各包自己伪造一个
 * `QueryTask`，验的就是测试作者写的流而不是生产装配的那条——`@aiao/rxdb-plugin-tree`
 * 的树合并用例与核心的基础合并用例必须站在同一个台子上，否则「合并语义一致」无从谈起。
 */

/**
 * 实体元数据槽位 Symbol。
 *
 * @remarks
 * 这是 `rxdb.private.ts` 里的内部槽位，**不在主入口上**，也不该在：业务实体的元数据
 * 只能经 `@Entity` / `@TreeEntity` 装饰器产出，公开这个键等于允许绕过校验直接写。
 *
 * 但自带 Repository 的插件做单元测试时必须造「一个带元数据的实体类型」而不引入
 * 整条装配链——`TreeRepository` 的用例要的就是一份手写元数据加一个 RxDB 替身。
 * 包外另写一句 `Symbol.for('@aiao/rxdb/ɵMetadata')` 也能拿到同一个 Symbol
 * （`Symbol.for` 是全局注册表），但那份字面量与核心的定义没有任何编译期联系，
 * 核心改名它不会红。从这里转出去，改名就是一次编译错误。
 */
export { METADATA } from './rxdb.private.js';

export { cloneEntityClasses } from './testing/clone-entity-classes.js';

export {
  collectEmissions,
  createHarnessQueryTask,
  type EntityCache,
  type HarnessSchemaOverrides,
  type HarnessTaskOptions
} from './testing/query-task-harness.js';
