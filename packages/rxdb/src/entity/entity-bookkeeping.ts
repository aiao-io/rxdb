/**
 * @fileoverview 实体行上的簿记字段清单
 */

/**
 * 实体行上不表达用户意图的簿记字段：同步回填的 `remoteId` 与审计时间 `createdAt` / `updatedAt`。
 *
 * @remarks
 * 这些列由核心定义（实体基类的审计时间、同步回填的远端 id），所以清单也放在核心。两个插件按同一份判定：
 * 工作树插件把它们判为 untracked（`UNTRACKED_BOOKKEEPING_FIELDS` 就是本常量），历史插件的分支对比与
 * 合并预览不把它们算作差异或覆盖。两处各写一份的话，迟早有一边加了新列另一边没跟上。
 *
 * 不含 `createdBy` / `updatedBy`：审计主体是谁写的，与写了什么同属一次真实的净变化。
 * 不含 `id`：主键是行的身份，不是它的簿记。
 */
export const ENTITY_BOOKKEEPING_FIELDS: readonly string[] = ['remoteId', 'createdAt', 'updatedAt'];
