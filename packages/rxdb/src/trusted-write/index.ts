/**
 * @fileoverview 受信写声明通道：核心 `version/` 下的批量重写路径如何自报身份。
 *
 * @remarks
 * **整条通道留在核心，不随提交能力走。** 理由不是它与提交无关——它的唯一消费者恰恰是捕获层——
 * 而是 {@link declareTrustedWrite} 的 fail-closed 语义：未登记的三段身份当场抛错。这道门
 * 必须对**所有**用户无条件生效。搬进插件的话，没装插件的用户会静默失去它，于是新增一条批量
 * 重写路径而忘了登记，在不装插件时一路绿灯、装上插件才炸——「装了才对、没装静默错」是本次
 * 抽包最该避免的形态。
 *
 * 通道本身对捕获钩子没有任何运行期依赖：{@link declareTrustedWrite} 只做「登记表查表 +
 * `WeakMap.set`」，{@link takeDeclaredWrite} 的唯一消费者在插件侧。没装插件时没人取用，
 * 条目随作用域对象一起被 GC。
 *
 * 三块内容的分工：`write-entrance.ts` 是入口词汇表，`trusted-write-intent.ts` 是意图枚举与
 * 9 行调用点登记表，`trusted-write-scope.ts` 是作用域化的声明/取用。
 */
export * from './trusted-write-intent.js';
export * from './trusted-write-scope.js';
export * from './write-entrance.js';
