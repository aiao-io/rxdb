/**
 * @fileoverview 核心私有 Symbol 槽位的本地取回
 *
 * @remarks
 * `METADATA` / `STATUS` 是 `@aiao/rxdb` 的 `rxdb.private.ts` 用
 * `Symbol.for('@aiao/rxdb/…')` 建的 —— **全局 Symbol 注册表**里的键，同一个字符串在任何
 * 模块里取到的都是同一个引用。因此搬进本包的用例可以原地取回它们来手搭实体替身，
 * 不必让核心为测试多开一条公开导出。
 *
 * 字符串必须与核心逐字一致；改了核心那边，这里会以「元数据读不到」的形态立刻失败。
 *
 * 本包与其他插件包里的这份副本逐字相同，这是**有意**的重复，不要往 `@aiao/rxdb-test` 收敛——
 * 理由见该包 README 的「什么不搬进来」。
 */

/** 挂在实体**类构造器**上的元数据槽位，与核心 `rxdb.private.ts` 的 `METADATA` 同键 */
export const METADATA: unique symbol = Symbol.for('@aiao/rxdb/ɵMetadata') as never;

/** 挂在实体**实例**上的状态槽位，与核心 `rxdb.private.ts` 的 `STATUS` 同键 */
export const STATUS: unique symbol = Symbol.for('@aiao/rxdb/ɵStatus') as never;
