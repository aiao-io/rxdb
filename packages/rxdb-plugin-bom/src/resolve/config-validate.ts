/**
 * @fileoverview 配置保存期校验与配置输入判定（US-517）
 *
 * 保存期：解析选择条件并核对特征 / 值引用——未知标识一次性点名位置（AC#5），
 * 语法错误由解析器直接点名（{@link BomConfigSyntaxError}），不留到展开期才炸。
 * 配置输入面（求解契约的纯函数段）：必选特征完整性（AC#3，缺参不静默产出部分结构）
 * 与依赖约束冲突判定（AC#2：exclude 互斥 / require 蕴含）。
 */

import {
  BomConfigError,
  evaluateCondition,
  parseCondition,
  positionText,
  type ConditionAst
} from './config-condition.js';

/** 行 / 列位置的人读形式；无位置信息（手工构造的 AST）时省略。 */
const positionOf = (expression: string, offset: number | undefined): string =>
  offset === undefined ? '' : `（${positionText(expression, offset)}）`;

/**
 * 保存期校验选择条件的引用（AC#5）：解析后遍历 AST，特征与值必须存在于已知集合。
 *
 * @remarks
 * 语法错误由 {@link parseCondition} 原样上抛（BomConfigSyntaxError，是 BomConfigError 的子类）；
 * 未知标识逐个收集、一次性点名（每个都带行 / 列位置），不静默放行。
 *
 * @param expression - 条件表达式文本
 * @param knownChars - 已存在的特征 code 集合（如本组织的 config_char）
 * @param knownValues - 已存在的选项值集合（如本组织的 config_char_value）
 * @throws {@link BomConfigError} 引用未知特征 / 值（点名标识与位置）
 */
export const validateConditionReferences = (
  expression: string,
  knownChars: Set<string>,
  knownValues: Set<string>
): void => {
  const { ast } = parseCondition(expression);
  const problems: string[] = [];
  const visit = (node: ConditionAst): void => {
    switch (node.kind) {
      case 'atom': {
        if (!knownChars.has(node.charCode)) {
          problems.push(`未知特征「${node.charCode}」${positionOf(expression, node.offset)}`);
        }
        const values = node.op === 'in' ? node.value : [node.value];
        values.forEach((value, index) => {
          if (!knownValues.has(value)) {
            problems.push(`未知值「${value}」${positionOf(expression, node.valueOffsets?.[index])}`);
          }
        });
        break;
      }
      case 'and':
      case 'or':
        node.operands.forEach(visit);
        break;
      case 'not':
        visit(node.operand);
        break;
    }
  };
  visit(ast);
  if (problems.length > 0) {
    throw new BomConfigError(`条件 ${expression}`, problems.join('；'));
  }
};

/**
 * 必选特征完整性判定（AC#3）
 *
 * @remarks
 * 未赋值 = 配置输入里没有该特征，或选中值集合为空。返回未赋值特征列表而非部分结构：
 * 调用方据此整体拒绝（US-517 AC#3「不静默产出部分结构」）。返回顺序随 `requiredChars`，
 * 重复 code 只报告一次。
 *
 * @param selection - 配置输入（特征 code → 选中值集合）
 * @param requiredChars - 必选特征 code 列表（config_char.required = true 的那些）
 * @returns 未赋值的必选特征 code 列表（空 = 配置完整）
 */
export const checkConfigCompleteness = (selection: Record<string, string[]>, requiredChars: string[]): string[] => {
  const missing: string[] = [];
  const reported = new Set<string>();
  for (const code of requiredChars) {
    if (reported.has(code)) continue;
    reported.add(code);
    const selected = selection[code];
    if (selected === undefined || selected.length === 0) {
      missing.push(code);
    }
  }
  return missing;
};

/** 依赖约束的求值输入（两侧各一条已解析的选择条件，同一语法版本）。 */
export interface ConfigConstraintInput {
  /** 约束 code（冲突消息点名）。 */
  code: string;
  /** exclude 互斥（两侧同真即冲突）/ require 蕴含（左真右假即冲突）。 */
  kind: 'exclude' | 'require';
  leftAst: ConditionAst;
  rightAst: ConditionAst;
}

/**
 * 依赖约束冲突判定（AC#2）：对给定配置输入分别求两侧条件，按种类判冲突。
 *
 * @remarks
 * 只做「条件 → 条件」一级求值，约束之间不做推理（求解契约：外挂求解器在冲突清单上
 * 做约束传播，不在本函数内）。未知种类按违约报告——数据损坏也要出声，不静默跳过。
 *
 * @param constraints - 依赖约束（含已解析的两侧条件）
 * @param selection - 配置输入（特征 code → 选中值集合）
 * @returns 冲突清单（中文消息，按约束顺序；空 = 无冲突）
 */
export const checkConfigConflicts = (
  constraints: ConfigConstraintInput[],
  selection: Record<string, string[]>
): string[] => {
  const conflicts: string[] = [];
  for (const constraint of constraints) {
    const leftSatisfied = evaluateCondition(constraint.leftAst, selection);
    const rightSatisfied = evaluateCondition(constraint.rightAst, selection);
    if (constraint.kind === 'exclude') {
      if (leftSatisfied && rightSatisfied) {
        conflicts.push(`约束「${constraint.code}」：左/右条件同时满足`);
      }
    } else if (constraint.kind === 'require') {
      if (leftSatisfied && !rightSatisfied) {
        conflicts.push(`约束「${constraint.code}」：左条件满足而右条件不满足`);
      }
    } else {
      conflicts.push(`约束「${constraint.code}」：未知约束种类「${String(constraint.kind)}」，按违约报告`);
    }
  }
  return conflicts;
};
