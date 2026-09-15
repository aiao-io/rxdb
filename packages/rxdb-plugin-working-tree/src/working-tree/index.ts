/**
 * @fileoverview 工作树（working tree）—— 可变的一面
 *
 * @remarks
 * 本目录承载 epic-006 v1 中**每次写入都在变**的那一半：未提交变更单元的捕获与折叠、
 * `status` / `diff` / `commit` / `discard` 操作面、恢复会话，以及目标分支物化 staging。
 *
 * 与之相对的不可变一面在 `../commit/`。
 *
 * v1 只有**一条 diff 轴**：`HEAD ↔ 工作树`。没有 `HEAD ↔ index` 的第二条轴，
 * 因为没有 index。详见 `specs/001-working-tree-commits/spec.md` 硬裁决 2。
 */
export * from './activation-state.js';
export * from './working-tree-facade.js';
export * from './working-tree-patch-codec.js';
// 写入面（US-306 阶段 A）：判定、门禁、捕获、折叠与冷重放不变量。
// **适配器不从这里取 raw 判定**：它们调核心的 `gateRawWrite(sql, ctx, execute)`（6 处引用，
// 分布在 pglite 与 sqlite-core 两个包），由核心按能力位转交到 `applyRawWriteJudgment`。
// 这一份实现因此仍然只有一份——adapter-contract.md §2 的要求落在「核心只做分派」这一句上，
// 而不是落在「大家都 import 同一个模块」上。判定本身仍要导出：一致性套件与后续插件侧的
// 调用点都要叫得出 `judgeRawWrite` 的名字，而只能靠结论形状反推的判定等于没有契约。
export * from './bulk-write-gate.js';
export * from './capture-hook.js';
export * from './capture-mount-points.js';
export * from './capture-runtime.js';
export * from './cold-replay.js';
// 操作面（US-306 阶段 B）：status / diff / commit / discard 与它们的诊断类型。
// `CommitConflict` 必须在公开面上：它是 commit / discard 的**返回值**，调用方不 import
// 它就只能靠 `result.ok === false` 之后的鸭子类型读 kind——而那正是漂移的起点（T082）。
// 三端入口共用的异步状态契约（US-306 阶段 C）：命令 loading/success/error，
// 查询多一个 empty。放在核心而不是三个框架包里，是因为「commit 有没有空成功」这种问题
// 一旦有三份答案，分歧只在用户那里暴露（tri-framework-api.md §1/§4）。
export * from './async-state.js';
export * from './commit-command.js';
export * from './commit-conflict.js';
export * from './diff.js';
export * from './discard-command.js';
export * from './external-notify-gate.js';
export * from './raw-write-judgment.js';
export * from './status.js';
export * from './trusted-callsite-capture.js';
export * from './versioned-domain.js';
export * from './working-tree-commands.js';
export * from './write-entry-matrix.js';
export * from './write-entry.js';
