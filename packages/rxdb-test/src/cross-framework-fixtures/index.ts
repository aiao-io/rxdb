/**
 * 跨框架（Angular / React / Vue）共享的测试 fixture。
 *
 * @remarks
 * RXT-007：这里曾另有 6 个 `find-by-cursor-*.json`，声称是三端共享的游标契约，
 * 实际**全仓零消费者**，且 `input` 不符合公开类型（`where: {}` 缺 `combinator`/`rules`、
 * `sort: "ASC"` 大小写错误、`limit=0` 的 `expected` 与当前实现冲突）。
 * 它们让人误以为游标行为已有三端一致性保障，已删除。
 * 真正的三端参数化游标契约需要由同一张参数表驱动三端各自真实执行，属独立立项。
 *
 * Fixture 文件：
 * - search-parity.ts — search parity 种子（Article/Comment），由三端 demo 实际消费
 * - entity-fields-descriptor.ts — US-012 字段描述契约，由三端 `tri-framework-field-descriptor.spec.ts` 消费
 */

export * from './entity-fields-descriptor.js';
export * from './search-parity.js';
