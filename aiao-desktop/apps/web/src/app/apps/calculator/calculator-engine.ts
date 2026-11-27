export type CalcOperator = 'add' | 'sub' | 'mul' | 'div';
export type CalcKey =
  `n${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}` | CalcOperator | 'dot' | 'del' | 'ac' | 'neg' | 'pct' | 'eq';

/** 计算器状态：`cur` 是屏幕上的字符串，`fresh` 表示下一次输入会替换它。 */
export interface CalcState {
  readonly acc: number | null;
  readonly op: CalcOperator | null;
  readonly cur: string;
  readonly fresh: boolean;
  readonly lastOp: CalcOperator | null;
  readonly lastArg: number | null;
}

export const CALC_RESET: CalcState = { acc: null, op: null, cur: '0', fresh: true, lastOp: null, lastArg: null };

const OPERATORS: readonly string[] = ['add', 'sub', 'mul', 'div'];

const apply = (a: number, b: number, op: CalcOperator): number => {
  if (op === 'add') return a + b;
  if (op === 'sub') return a - b;
  if (op === 'mul') return a * b;
  return b === 0 ? NaN : a / b;
};

/** 数值转显示字符串：12 位小数内舍入，消掉浮点尾巴。 */
const toText = (n: number): string => {
  if (!isFinite(n)) return isNaN(n) ? 'Error' : '∞';
  const rounded = Math.round(n * 1e12) / 1e12;
  return String(Math.abs(rounded) < 1e-12 ? 0 : rounded);
};

/** 屏幕显示：千分位，超过 15 位整数改用科学计数法。 */
export function formatCalc(text: string): string {
  if (text === 'Error' || text === '∞') return text;
  const negative = text.startsWith('-');
  const value = negative ? text.slice(1) : text;
  const [integer, decimal] = value.split('.');
  const sign = negative ? '-' : '';
  if (integer.length > 15) return sign + Number(value).toExponential(6).replace('e+', 'e');
  return sign + integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (decimal !== undefined ? `.${decimal}` : '');
}

const digit = (state: CalcState, d: string): CalcState => {
  if (state.fresh) return { ...state, cur: d, fresh: false };
  if (state.cur === '0') return { ...state, cur: d };
  return state.cur.replace(/[^\d.-]/g, '').length < 16 ? { ...state, cur: state.cur + d } : state;
};

const equals = (state: CalcState): CalcState => {
  const b = parseFloat(state.cur);
  const done = { ...state, acc: null, op: null, fresh: true };
  if (state.op !== null && state.acc !== null) {
    return { ...done, cur: toText(apply(state.acc, b, state.op)), lastOp: state.op, lastArg: b };
  }
  if (state.lastOp && state.lastArg !== null) return { ...done, cur: toText(apply(b, state.lastArg, state.lastOp)) };
  return done;
};

/** 连按运算符时先把前一步算完，和真机一样。 */
const operator = (state: CalcState, op: CalcOperator): CalcState => {
  const b = parseFloat(state.cur);
  if (state.op !== null && state.acc !== null && !state.fresh) {
    const acc = apply(state.acc, b, state.op);
    return { ...state, acc, cur: toText(acc), op, fresh: true, lastOp: null };
  }
  return { ...state, acc: b, op, fresh: true, lastOp: null };
};

const clearKey = (state: CalcState): CalcState =>
  state.cur !== '0' && !state.fresh ? { ...state, cur: '0', fresh: true } : CALC_RESET;

const backspace = (state: CalcState): CalcState => {
  if (state.fresh) return state;
  const cur = state.cur.length > 1 ? state.cur.slice(0, -1) : '0';
  return { ...state, cur: cur === '-' ? '0' : cur };
};

const negate = (state: CalcState): CalcState => {
  if (state.cur.startsWith('-')) return { ...state, cur: state.cur.slice(1) };
  return { ...state, cur: state.cur === '0' ? '0' : `-${state.cur}` };
};

const decimalPoint = (state: CalcState): CalcState => {
  if (state.fresh) return { ...state, cur: '0.', fresh: false };
  return state.cur.includes('.') ? state : { ...state, cur: `${state.cur}.` };
};

/** 百分比：算式中按累计值的百分比（200+10% → 20），单独按下维持 ÷100。 */
const percent = (state: CalcState): CalcState => {
  const b = parseFloat(state.cur);
  if (state.op !== null && state.acc !== null) return { ...state, cur: toText((state.acc * b) / 100), fresh: true };
  return { ...state, cur: toText(b / 100), fresh: false };
};

const ACTIONS: Readonly<Record<string, (state: CalcState) => CalcState>> = {
  dot: decimalPoint,
  del: backspace,
  ac: clearKey,
  neg: negate,
  pct: percent,
  eq: equals
};

/** 粘贴文本里能回放成按键的字符：数字与小数点（逗号同小数点），其余跳过。 */
export function calcKeysOfText(text: string): readonly CalcKey[] {
  const keys: CalcKey[] = [];
  for (const char of text) {
    if (/[0-9]/.test(char)) keys.push(`n${char}` as CalcKey);
    else if (char === '.' || char === ',') keys.push('dot');
  }
  return keys;
}

/** 物理键盘符号 → 规范键名（与计算器 UI 的键盘表一致）。 */
const KEY_ALIASES: Readonly<Partial<Record<string, CalcKey>>> = {
  '+': 'add',
  '-': 'sub',
  '*': 'mul',
  '/': 'div',
  '%': 'pct'
};

/** 按一个键，返回新状态。除规范键名外，也接受物理键盘的数字字符与运算符符号（`7`、`+`、`*`、`%`…）。 */
export function pressCalc(state: CalcState, key: CalcKey): CalcState {
  const canonical = KEY_ALIASES[key] ?? key;
  if (/^[0-9]$/.test(canonical)) return digit(state, canonical);
  if (canonical.length === 2 && canonical.startsWith('n')) return digit(state, canonical[1]);
  if (OPERATORS.includes(canonical)) return operator(state, canonical as CalcOperator);
  return ACTIONS[canonical](state);
}
