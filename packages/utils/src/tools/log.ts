import { isObject } from '../types/index.js';

/**
 * 以表格形式打印错误信息
 *
 * @param err - 错误对象或错误信息
 * @param args - 先于错误表格输出的上下文
 */
export const logError = (err: unknown, ...args: unknown[]): void => {
  const errorTable: unknown[][] = [];
  if (isObject(err)) {
    Object.keys(err)
      .sort()
      .forEach(key => errorTable.push([key, Reflect.get(err, key) as unknown]));
  } else {
    errorTable.push([err]);
  }

  const currentConsole = globalThis.console;
  args.forEach(arg => currentConsole.log(arg));
  const log = currentConsole.table?.bind(currentConsole) ?? currentConsole.log.bind(currentConsole);
  log(errorTable);
};
