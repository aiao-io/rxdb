/**
 * @fileoverview 把任意抛出值摊平成可 JSON 序列化的描述。
 *
 * 支付宝 FS 失败时返回错误对象而不抛，包装层把它挂在 cause 上再抛；实验要的是原样记录：
 * 类型、构造器、文案、错误码、自有键，以及 cause 链。
 */

/** 一个抛出值的完整描述。 */
export interface DescribedError {
  readonly typeof: string;
  readonly constructorName?: string;
  readonly name?: string;
  readonly message?: string;
  readonly errMsg?: string;
  /** 支付宝错误对象的文案字段（两端都有；iOS 另带一个同文的 `message`）。 */
  readonly errorMessage?: string;
  /** 平台可能用到的错误码字段，只收实际存在的。 */
  readonly codes: Readonly<Record<string, unknown>>;
  readonly ownKeys: readonly string[];
  /** `String(error)`；它本身抛错时记下原因。 */
  readonly text: string;
  readonly cause?: DescribedError;
}

/** 平台错误码可能的字段名：支付宝 FS 用 `error`（数字），模拟器内部错误用 `errorCode`（字符串），其余是常见写法。 */
const CODE_KEYS = ['error', 'errNo', 'errno', 'errCode', 'errorCode', 'code'] as const;

/** cause 链最多展开的层数，防环。 */
const MAX_CAUSE_DEPTH = 5;

function stringField(target: object, key: string): string | undefined {
  const value: unknown = Reflect.get(target, key);
  return typeof value === 'string' ? value : undefined;
}

function safeText(error: unknown): string {
  try {
    return String(error);
  } catch (stringifyError) {
    return `String() 抛出: ${stringifyError instanceof Error ? stringifyError.message : typeof stringifyError}`;
  }
}

function constructorNameOf(target: object): string | undefined {
  const constructor: unknown = Reflect.get(target, 'constructor');
  return typeof constructor === 'function' ? constructor.name : undefined;
}

function describeObject(error: object, depth: number): DescribedError {
  const codes: Record<string, unknown> = {};
  for (const key of CODE_KEYS) {
    if (key in error) codes[key] = Reflect.get(error, key);
  }
  const cause: unknown = 'cause' in error ? error.cause : undefined;
  return {
    typeof: typeof error,
    constructorName: constructorNameOf(error),
    name: stringField(error, 'name'),
    message: stringField(error, 'message'),
    errMsg: stringField(error, 'errMsg'),
    errorMessage: stringField(error, 'errorMessage'),
    codes,
    ownKeys: Object.getOwnPropertyNames(error),
    text: safeText(error),
    cause: cause !== undefined && depth < MAX_CAUSE_DEPTH ? describeError(cause, depth + 1) : undefined
  };
}

/** 描述任意抛出值；`depth` 是内部递归用的 cause 层数。 */
export function describeError(error: unknown, depth = 0): DescribedError {
  if (error !== null && (typeof error === 'object' || typeof error === 'function')) {
    return describeObject(error, depth);
  }
  return { typeof: typeof error, codes: {}, ownKeys: [], text: safeText(error) };
}

/**
 * adapter 报错与 VFS 判定实际读到的文案：先 `errMsg`，再 `message`，都没有才 `String()`。
 *
 * 与 `packages/rxdb-adapter-miniprogram/src/error-message.ts` 同序；那个函数不导出，只能照抄。
 */
export function adapterErrorText(error: unknown): string {
  if (error && typeof error === 'object') {
    const errMsg = stringField(error, 'errMsg');
    if (errMsg !== undefined) return errMsg;
    const message = stringField(error, 'message');
    if (message !== undefined) return message;
  }
  return safeText(error);
}
