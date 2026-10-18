import { RxDBError } from '../RxDBError.js';

const tokensOf = (sql: string): string[] =>
  sql.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|->>|->|::|>=|<=|<>|!=|[\p{L}_][\p{L}\p{N}_$]*|\d+(?:\.\d+)?|[^\s]/gu) ?? [];

const identifier = (token: string): string =>
  token.startsWith('"') ? token.slice(1, -1).replaceAll('""', '"') : token.toLowerCase();

class StorageExpressionParser {
  private position = 0;

  constructor(private readonly tokens: readonly string[]) {}

  parse(): string {
    const result = this.expression();
    if (this.position !== this.tokens.length) throw new RxDBError('存储目录表达式不属于声明式白名单');
    return result;
  }

  private peek(): string {
    return this.tokens[this.position]?.toUpperCase() ?? '';
  }

  private expect(token: string): void {
    if (this.peek() !== token) throw new RxDBError(`存储目录表达式缺少 ${token}`);
    this.position += 1;
  }

  private expression(minimum = 0): string {
    let left = this.primary();
    for (;;) {
      const next = this.peek();
      if (next === '::') {
        left = this.cast(left);
        continue;
      }
      const binding =
        next === '->' || next === '->>' ? 30
        : next === '=' || next === 'IN' ? 10
        : -1;
      if (binding < minimum) return left;
      this.position += 1;
      if (next === 'IN') left = `in(${left},${this.arguments().join(',')})`;
      else left = `${next}(${left},${this.expression(binding + 1)})`;
    }
  }

  private primary(): string {
    if (this.peek() === '(') {
      this.position += 1;
      const result = this.expression();
      this.expect(')');
      return result;
    }
    if (this.peek() === 'CASE') return this.caseExpression();
    const token = this.tokens[this.position++];
    if (token === undefined) throw new RxDBError('存储目录表达式意外结束');
    if (token.startsWith("'")) return `literal:${JSON.stringify(token.slice(1, -1).replaceAll("''", "'"))}`;
    if (token.toUpperCase() === 'NULL') return 'null';
    if (/^\d/.test(token)) return `number:${token}`;
    let name = identifier(token);
    if (this.peek() === '.') {
      this.position += 1;
      const member = this.tokens[this.position++];
      if (name !== 'pg_catalog' || member === undefined) throw new RxDBError('存储目录表达式含未知限定名');
      name = identifier(member);
    }
    if (this.peek() !== '(') return `column:${JSON.stringify(name)}`;
    if (!['json_extract', 'json_type', 'jsonb_typeof'].includes(name))
      throw new RxDBError(`存储目录表达式含未知函数 ${name}`);
    return `${name}(${this.arguments().join(',')})`;
  }

  private arguments(): string[] {
    this.expect('(');
    const values: string[] = [this.expression()];
    while (this.peek() === ',') {
      this.position += 1;
      values.push(this.expression());
    }
    this.expect(')');
    return values;
  }

  private cast(value: string): string {
    this.expect('::');
    const token = this.tokens[this.position++];
    const type = token?.toLowerCase();
    if (type === undefined || !['text', 'numeric', 'boolean', 'jsonb'].includes(type)) {
      throw new RxDBError(`存储目录表达式含未知类型转换 ${String(type)}`);
    }
    if (value === 'null' || (value.startsWith('literal:') && type === 'text')) return value;
    return `cast:${type}(${value})`;
  }

  private caseExpression(): string {
    this.expect('CASE');
    this.expect('WHEN');
    const condition = this.expression();
    this.expect('THEN');
    const yes = this.expression();
    this.expect('ELSE');
    const no = this.expression();
    this.expect('END');
    return `case(${condition},${yes},${no})`;
  }
}

/** 只解析本库 JSON 白名单表达式，以结构比较目录定义，保留运算优先级。 */
export const storageExpressionIdentity = (sql: string): string => new StorageExpressionParser(tokensOf(sql)).parse();

const listAt = (tokens: readonly string[], opening: number): { items: string[][]; end: number } => {
  const items: string[][] = [[]];
  let depth = 0;
  for (let index = opening + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === ')' && depth === 0) return { items, end: index };
    if (token === ',' && depth === 0) {
      items.push([]);
      continue;
    }
    if (token === '(') depth += 1;
    if (token === ')') depth -= 1;
    items[items.length - 1].push(token);
  }
  throw new RxDBError('存储目录 DDL 的括号不完整');
};

/** 从 SQLite 索引目录 DDL 读取索引项，表达式仍交由白名单结构解析。 */
export const storageIndexExpressions = (sql: string): readonly string[] => {
  const tokens = tokensOf(sql);
  const on = tokens.findIndex(token => token.toUpperCase() === 'ON');
  const opening = tokens.indexOf('(', on + 1);
  if (on < 0 || opening < 0) throw new RxDBError('存储索引目录缺少 ON 或索引项');
  return listAt(tokens, opening).items.map(item => item.join(' '));
};

/** 从 SQLite 建表目录读取托管生成列的真实表达式，不匹配字符串中的伪声明。 */
export const storageGeneratedExpressions = (sql: string): ReadonlyMap<string, string> => {
  const tokens = tokensOf(sql);
  const opening = tokens.indexOf('(');
  const result = new Map<string, string>();
  if (opening < 0) return result;
  for (const column of listAt(tokens, opening).items) {
    const name = column[0] === undefined ? '' : identifier(column[0]);
    if (!name.startsWith('gc_')) continue;
    let depth = 0;
    const as = column.findIndex(token => {
      if (token === '(') depth += 1;
      if (token === ')') depth -= 1;
      return depth === 0 && token.toUpperCase() === 'AS';
    });
    if (as < 0) continue;
    if (column[as + 1] !== '(') throw new RxDBError(`生成列目录 ${name} 缺少表达式`);
    const expression = listAt(column, as + 1);
    result.set(name, expression.items.map(item => item.join(' ')).join(','));
  }
  return result;
};
