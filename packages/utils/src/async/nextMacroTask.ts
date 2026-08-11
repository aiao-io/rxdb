/**
 * 在下一个宏任务中执行函数
 * 使用 setTimeout(fn, 0) 将函数推迟到当前执行栈清空后执行
 * @param fn - 要延迟执行的函数
 * @example
 * console.log('1');
 * nextMacroTask(() => console.log('3'));
 * console.log('2');
 * // 输出顺序: 1, 2, 3
 * **注意：** 宏任务包括 setTimeout、setInterval、I/O 操作等
 * **注意：** 常用于避免阻塞当前执行栈，或确保 DOM 更新后再执行代码
 * **注意：** 与 nextMicroTask 的区别：宏任务在微任务之后执行
 */
export const nextMacroTask = (fn: () => unknown) => setTimeout(() => fn(), 0);
