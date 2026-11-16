import { CollaborationError, demand, type Resolution } from '../model.js';

const choices: readonly string[] = ['source', 'target', 'custom'];
const isChoice = (value: string): value is Resolution['choice'] => choices.includes(value);

/** 把「自定义结果」输入解析成 JSON 值；非法输入抛出带词条的错误。 */
function customValue(text: string): Resolution['value'] {
  demand(text.trim(), 'invalid', '自定义冲突值不能为空');
  try {
    return JSON.parse(text) as Resolution['value'];
  } catch {
    throw new CollaborationError('invalid', 'JSON 格式错误');
  }
}

/**
 * 读取一条冲突的处理选择：未选择返回 null；采用来源或保留目标只产出选择本身；
 * 「自定义」要求结果是合法的 JSON 值，非法输入抛出带词条的 {@link CollaborationError}。
 * 调用方须在统一的执行路径内调用它，错误才会作为提示显示给用户。
 */
export function readResolution(key: string, choice: string, custom: string): Resolution | null {
  if (!choice) return null;
  demand(isChoice(choice), 'invalid', '请求字段不合法');
  if (choice !== 'custom') return { key, choice };
  return { key, choice, value: customValue(custom) };
}
