/**
 * 流式 JSON 实体解析器
 *
 * 增量解析 AI 生成的 `{ "thinking": "...", "entities": [{...}, ...] }` JSON 流，
 * 逐个提取 entities 数组中的完整实体，支持实体内属性级进度追踪。
 *
 * 基于 stream-json 的设计理念，使用字符级状态机进行括号计数，
 * 零外部依赖，浏览器/Node 通用。
 */

/** 解析器回调接口 */
export interface StreamingEntityCallbacks {
  /** thinking 内容更新（每次 write 可能触发） */
  onThinking?: (text: string) => void;
  /** 实体内部进度更新（部分字段可用时触发） */
  onEntityProgress?: (partial: Record<string, unknown>, index: number) => void;
  /** 完整实体解析就绪 */
  onEntityComplete?: (entity: Record<string, unknown>, index: number) => void;
  /** 全部解析完成 */
  onComplete?: (result: StreamingParseResult) => void;
  /** 解析错误（不中断流程，跳过该实体继续） */
  onError?: (error: Error) => void;
}

/** 最终解析结果 */
export interface StreamingParseResult {
  thinking: string;
  entities: Record<string, unknown>[];
}

/**
 * 在 JSON 对象的顶层查找指定 key 对应 value 的起始位置
 *
 * 返回 value 第一个非空白字符的位置，找不到返回 -1。
 * 正确处理字符串内容、嵌套对象/数组，仅匹配 braceDepth === 1 的 key。
 */
export function findTopLevelValue(json: string, key: string): number {
  const target = `"${key}"`;
  let inStr = false;
  let esc = false;
  let braceDepth = 0;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];

    if (esc) {
      esc = false;
      continue;
    }
    if (ch === '\\' && inStr) {
      esc = true;
      continue;
    }

    if (ch === '"') {
      if (!inStr && braceDepth === 1 && i + target.length <= json.length) {
        if (json.substring(i, i + target.length) === target) {
          let j = i + target.length;
          while (j < json.length && /\s/.test(json[j])) j++;
          if (j >= json.length || json[j] !== ':') {
            inStr = !inStr;
            continue;
          }
          j++;
          while (j < json.length && /\s/.test(json[j])) j++;
          return j < json.length ? j : -1;
        }
      }
      inStr = !inStr;
      continue;
    }

    if (inStr) continue;
    if (ch === '{') braceDepth++;
    else if (ch === '}') braceDepth--;
  }

  return -1;
}

/**
 * 尝试关闭未完成的 JSON 片段并解析为对象
 *
 * 通过括号计数补全未闭合的字符串、数组、对象，
 * 使 JSON.parse 能成功。用于实体进度追踪。
 */
export function closeAndParseJson(partial: string): Record<string, unknown> | null {
  let s = partial;
  let inStr = false;
  let esc = false;
  const stack: ('{' | '[')[] = [];

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === '\\' && inStr) {
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === '{') stack.push('{');
    else if (ch === '}') {
      if (stack.length && stack[stack.length - 1] === '{') stack.pop();
    } else if (ch === '[') stack.push('[');
    else if (ch === ']') {
      if (stack.length && stack[stack.length - 1] === '[') stack.pop();
    }
  }

  if (inStr) s += '"';
  s = s.replace(/[,:\s]+$/, '');
  for (let i = stack.length - 1; i >= 0; i--) {
    s += stack[i] === '{' ? '}' : ']';
  }

  try {
    const result = JSON.parse(s);
    if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
      return result as Record<string, unknown>;
    }
  } catch {
    // 无法解析，返回 null
  }

  return null;
}

/**
 * 流式实体解析器
 *
 * @example
 * ```ts
 * const parser = new StreamingEntityParser({
 *   onThinking: text => { /* handle thinking text *\/ },
 *   onEntityComplete: (entity, i) => { /* handle entity *\/ },
 *   onComplete: result => save(result.entities),
 * });
 * for await (const chunk of stream) {
 *   parser.write(chunk);
 * }
 * parser.end();
 * ```
 */
export class StreamingEntityParser {
  #buffer = '';
  #callbacks: StreamingEntityCallbacks;

  // Thinking 状态
  #thinkingValuePos = -1;
  #thinkingComplete = false;
  #lastThinkingText = '';

  // Entities 数组状态
  #entitiesValuePos = -1;
  #entityScanPos = -1;
  #entityObjStart = -1;
  #depth = 0;
  #inStr = false;
  #esc = false;
  #completedEntities: Record<string, unknown>[] = [];
  #lastProgressSnapshot = '';
  #arrayEnded = false;

  constructor(callbacks: StreamingEntityCallbacks = {}) {
    this.#callbacks = callbacks;
  }

  /** 写入 JSON 文本块 */
  write(chunk: string): void {
    this.#buffer += chunk;

    if (this.#thinkingValuePos === -1) {
      this.#thinkingValuePos = findTopLevelValue(this.#buffer, 'thinking');
    }
    if (this.#thinkingValuePos !== -1 && !this.#thinkingComplete) {
      this.#extractThinking();
    }

    if (this.#entitiesValuePos === -1) {
      const pos = findTopLevelValue(this.#buffer, 'entities');
      if (pos !== -1 && this.#buffer[pos] === '[') {
        this.#entitiesValuePos = pos + 1;
        this.#entityScanPos = this.#entitiesValuePos;
      }
    }
    if (this.#entitiesValuePos !== -1 && !this.#arrayEnded) {
      this.#scanEntities();
    }
  }

  /** 标记流结束，触发 onComplete */
  end(): void {
    this.write('');
    this.#callbacks.onComplete?.({
      thinking: this.#lastThinkingText,
      entities: [...this.#completedEntities]
    });
  }

  /** 获取当前已解析的结果（不触发回调） */
  getResult(): StreamingParseResult {
    return {
      thinking: this.#lastThinkingText,
      entities: [...this.#completedEntities]
    };
  }

  #extractThinking(): void {
    const pos = this.#thinkingValuePos;
    if (pos >= this.#buffer.length || this.#buffer[pos] !== '"') return;

    let inEsc = false;
    for (let j = pos + 1; j < this.#buffer.length; j++) {
      if (inEsc) {
        inEsc = false;
        continue;
      }
      if (this.#buffer[j] === '\\') {
        inEsc = true;
        continue;
      }
      if (this.#buffer[j] === '"') {
        const jsonStr = this.#buffer.substring(pos, j + 1);
        try {
          this.#lastThinkingText = JSON.parse(jsonStr) as string;
          this.#thinkingComplete = true;
        } catch {
          /* malformed — ignore */
        }
        this.#emitThinking();
        return;
      }
    }

    // 字符串未结束，提取可用部分
    const rawContent = this.#buffer.substring(pos + 1);
    this.#lastThinkingText = unescapePartialJsonString(rawContent);
    this.#emitThinking();
  }

  #emitThinking(): void {
    this.#callbacks.onThinking?.(this.#lastThinkingText);
  }

  #scanEntities(): void {
    for (let i = this.#entityScanPos; i < this.#buffer.length; i++) {
      const ch = this.#buffer[i];

      if (this.#esc) {
        this.#esc = false;
        continue;
      }
      if (ch === '\\' && this.#inStr) {
        this.#esc = true;
        continue;
      }
      if (ch === '"') {
        this.#inStr = !this.#inStr;
        continue;
      }
      if (this.#inStr) continue;

      if (ch === '{') {
        if (this.#depth === 0) {
          this.#entityObjStart = i;
          this.#lastProgressSnapshot = '';
        }
        this.#depth++;
      } else if (ch === '}') {
        this.#depth--;
        if (this.#depth === 0 && this.#entityObjStart !== -1) {
          this.#emitCompleteEntity(i);
          this.#entityObjStart = -1;
        }
      } else if (ch === ']' && this.#depth === 0) {
        this.#arrayEnded = true;
        this.#entityScanPos = i + 1;
        return;
      }
    }

    this.#entityScanPos = this.#buffer.length;

    if (this.#entityObjStart !== -1 && this.#depth > 0) {
      this.#emitEntityProgress();
    }
  }

  #emitCompleteEntity(endPos: number): void {
    const entityStr = this.#buffer.substring(this.#entityObjStart, endPos + 1);
    try {
      const entity = JSON.parse(entityStr) as Record<string, unknown>;
      this.#completedEntities.push(entity);
      this.#callbacks.onEntityComplete?.(entity, this.#completedEntities.length - 1);
    } catch (err) {
      this.#callbacks.onError?.(
        new Error(`Entity parse error at index ${this.#completedEntities.length}: ${(err as Error).message}`)
      );
    }
  }

  #emitEntityProgress(): void {
    const partialStr = this.#buffer.substring(this.#entityObjStart);
    const parsed = closeAndParseJson(partialStr);
    if (!parsed) return;
    const snapshot = JSON.stringify(parsed);
    if (snapshot === this.#lastProgressSnapshot) return;
    this.#lastProgressSnapshot = snapshot;
    this.#callbacks.onEntityProgress?.(parsed, this.#completedEntities.length);
  }
}

/**
 * 尝试 JSON 反转义不完整的字符串内容
 */
function unescapePartialJsonString(raw: string): string {
  let trimmed = raw;
  if (trimmed.endsWith('\\')) trimmed = trimmed.slice(0, -1);
  try {
    return JSON.parse(`"${trimmed}"`) as string;
  } catch {
    const trimmed2 = trimmed.replace(/\\u[\da-fA-F]{0,3}$/, '');
    try {
      return JSON.parse(`"${trimmed2}"`) as string;
    } catch {
      return raw;
    }
  }
}
