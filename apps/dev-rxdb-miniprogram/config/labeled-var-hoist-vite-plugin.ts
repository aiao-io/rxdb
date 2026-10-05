import { parseAst, type Plugin } from 'vite';

/** 只读用到的字段；Rollup 的 AST 是带 `start`/`end` 的 ESTree。 */
interface SyntaxNode {
  readonly [field: string]: unknown;
  readonly type: string;
  readonly start: number;
  readonly end: number;
}

/** 一个 var 作用域（函数体或程序）：补声明的插入点与要补的名字。 */
interface VarScope {
  readonly insertAt: number;
  readonly names: Set<string>;
}

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

function isSyntaxNode(value: unknown): value is SyntaxNode {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

function field(node: SyntaxNode, key: string): SyntaxNode {
  const value = node[key];
  if (!isSyntaxNode(value)) throw new Error(`${node.type}.${key} 不是语法节点`);
  return value;
}

function fieldList(node: SyntaxNode, key: string): SyntaxNode[] {
  const value = node[key];
  if (!Array.isArray(value)) throw new Error(`${node.type}.${key} 不是数组`);
  return value.filter(isSyntaxNode);
}

function childNodes(node: SyntaxNode): SyntaxNode[] {
  return Object.values(node)
    .flatMap(value => (Array.isArray(value) ? value : [value]))
    .filter(isSyntaxNode);
}

/** 绑定模式里声明的名字；对象模式只看属性值，键不是绑定。 */
function bindingNames(pattern: SyntaxNode): string[] {
  switch (pattern.type) {
    case 'Identifier':
      return [String(pattern['name'])];
    case 'AssignmentPattern':
      return bindingNames(field(pattern, 'left'));
    case 'RestElement':
      return bindingNames(field(pattern, 'argument'));
    case 'ArrayPattern':
      return fieldList(pattern, 'elements').flatMap(bindingNames);
    case 'ObjectPattern':
      return fieldList(pattern, 'properties').flatMap(property =>
        bindingNames(property.type === 'Property' ? field(property, 'value') : property)
      );
    default:
      throw new Error(`不认识的绑定模式 ${pattern.type}`);
  }
}

/** 语句列表开头的指令（`"use strict"`）之后；没有指令时是 `startAt`。 */
function afterDirectives(statements: readonly SyntaxNode[], startAt: number): number {
  let insertAt = startAt;
  for (const statement of statements) {
    if (statement.type !== 'ExpressionStatement' || typeof statement['directive'] !== 'string') break;
    insertAt = statement.end;
  }
  return insertAt;
}

function blockScope(block: SyntaxNode): VarScope {
  return { insertAt: afterDirectives(fieldList(block, 'body'), block.start + 1), names: new Set() };
}

/**
 * 收集 `node` 子树里标签语句内的 var 名字，记到它所在的 var 作用域。
 * 表达式体箭头函数里没有语句，标签语句只能出现在更里层的函数里，所以沿用外层作用域即可。
 */
function collect(node: SyntaxNode, scope: VarScope, inLabel: boolean, scopes: VarScope[]): void {
  if (node.type === 'StaticBlock') {
    throw new Error('产物里有 class static block：构建目标应已把它降级，插入点无从确定');
  }
  if (FUNCTION_TYPES.has(node.type)) {
    const body = field(node, 'body');
    const inner = body.type === 'BlockStatement' ? blockScope(body) : scope;
    if (inner !== scope) scopes.push(inner);
    for (const child of [...fieldList(node, 'params'), body]) collect(child, inner, false, scopes);
    return;
  }
  if (inLabel && node.type === 'VariableDeclaration' && node['kind'] === 'var') {
    for (const declarator of fieldList(node, 'declarations')) {
      bindingNames(field(declarator, 'id')).forEach(name => scope.names.add(name));
    }
  }
  const childInLabel = inLabel || node.type === 'LabeledStatement';
  for (const child of childNodes(node)) collect(child, scope, childInLabel, scopes);
}

/**
 * 把标签语句（`label: …`）里的 `var` 在所在函数（或程序）开头补一份无初值声明，原声明不动。
 *
 * 补的声明不带初值，ES 语义下与原来完全等价（var 本就提升到函数开头，重复声明不改值，也不覆盖同名参数）。
 *
 * @param code - 一个 chunk 的产物代码
 * @returns 补过声明的代码；没有要补的时原样返回
 * @throws 代码里有 class static block（构建目标应已降级），或碰到不认识的绑定模式
 */
export function hoistLabeledVars(code: string): string {
  const program = parseAst(code) as unknown as SyntaxNode;
  const top: VarScope = { insertAt: afterDirectives(fieldList(program, 'body'), program.start), names: new Set() };
  const scopes: VarScope[] = [top];
  collect(program, top, false, scopes);
  return scopes
    .filter(scope => scope.names.size > 0)
    .sort((left, right) => right.insertAt - left.insertAt)
    .reduce(
      (out, scope) => `${out.slice(0, scope.insertAt)}var ${[...scope.names].join(',')};${out.slice(scope.insertAt)}`,
      code
    );
}

/**
 * 支付宝开发者工具「真机调试」用 Boatman（JS 写的 JS 解释器）跑逻辑层代码，它预扫函数体提升 `var` 时不进标签语句：
 * 标签语句里的 `var` 要等语句真跑到才登记进函数作用域，没跑到的那次调用里，同名赋值会顺着作用域链写进外层闭包的变量。
 *
 * React 18 的 reconciler 正好踩中：`beginWork` 的 `case 3` 在 `e:{…}` 里 `var o`，`case 5` 再 `o=a.children`；
 * 走 `case 5` 时这次调用没登记过 `o`，赋值写穿到 reconciler 工厂闭包里的 `o`（即 `Symbol.for("react.element")`），
 * 此后所有元素都认不出来，渲染抛 React #31。普通预览、模拟器与其余平台是原生引擎，不受影响。
 *
 * 所以支付宝产物定稿时（`generateBundle`，压缩之后）按 {@link hoistLabeledVars} 给每个 chunk 补声明，让 Boatman
 * 预扫函数体顶层时就登记这些名字。开发者工具随后把产物转译成 ES5，函数开头的 var 原样保留。
 */
export function labeledVarHoistVitePlugin(): Plugin {
  return {
    name: 'dev-rxdb-miniprogram:labeled-var-hoist',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk') output.code = hoistLabeledVars(output.code);
      }
    }
  };
}
