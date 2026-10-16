/**
 * @fileoverview 可配置销售 BOM 纯函数测试（US-517：AC#1~#5 的纯函数消费面）
 *
 * 选择条件最小语法解析（含优先级与错误行/列点名）、求值（eq / ne / in、未选中语义、
 * 三值 NOT）、保存期引用校验（未知特征 / 值点名位置）、必选完整性（AC#3）与
 * 依赖约束冲突判定（AC#2）。AC#4（同一 BOM 两组配置输入得两份有效行集）属解析层，
 * 由 resolveBom 接入选择条件后另行覆盖；本文件只测纯函数面。
 */

import { describe, expect, it } from 'vitest';
import {
  BomConfigError,
  BomConfigSyntaxError,
  CONDITION_GRAMMAR_VERSION,
  evaluateCondition,
  parseCondition,
  positionText
} from '../resolve/config-condition.js';
import {
  checkConfigCompleteness,
  checkConfigConflicts,
  validateConditionReferences,
  type ConfigConstraintInput
} from '../resolve/config-validate.js';

/** 捕获函数抛出的错误（「应当抛出」断言）。 */
const caught = (action: () => unknown): Error => {
  try {
    action();
  } catch (error) {
    return error as Error;
  }
  throw new Error('应当抛出错误');
};

describe('可配置销售 BOM 纯函数（US-517）', () => {
  describe('parseCondition：最小语法与 AST', () => {
    it('原子谓词 = / != / in（AC#1 语法面）', () => {
      expect(parseCondition('颜色 = 红')).toEqual({
        ast: { kind: 'atom', charCode: '颜色', op: 'eq', value: '红', offset: 0, valueOffsets: [5] }
      });
      expect(parseCondition('颜色!=红')).toEqual({
        ast: { kind: 'atom', charCode: '颜色', op: 'ne', value: '红', offset: 0, valueOffsets: [4] }
      });
      expect(parseCondition('颜色 in (红, 蓝)')).toEqual({
        ast: { kind: 'atom', charCode: '颜色', op: 'in', value: ['红', '蓝'], offset: 0, valueOffsets: [7, 10] }
      });
    });

    it('引号字符串值与中文 / 数字 / 下划线标识符', () => {
      expect(parseCondition('颜色 = "红"')).toEqual({
        ast: { kind: 'atom', charCode: '颜色', op: 'eq', value: '红', offset: 0, valueOffsets: [5] }
      });
      expect(parseCondition('电池10Ah = 15Ah_Pro')).toEqual({
        ast: { kind: 'atom', charCode: '电池10Ah', op: 'eq', value: '15Ah_Pro', offset: 0, valueOffsets: [9] }
      });
    });

    it('AND / OR 拍平为 n 元节点，NOT 嵌套', () => {
      const andAst = parseCondition('颜色 = 红 AND 尺寸 = 大 AND 电池 in (10Ah, 15Ah)').ast;
      if (andAst.kind !== 'and') throw new Error('应为 and 节点');
      expect(andAst.operands).toHaveLength(3);
      expect(parseCondition('NOT (颜色 = 红 OR 尺寸 = 大)')).toEqual({
        ast: {
          kind: 'not',
          operand: {
            kind: 'or',
            operands: [
              { kind: 'atom', charCode: '颜色', op: 'eq', value: '红', offset: 5, valueOffsets: [10] },
              { kind: 'atom', charCode: '尺寸', op: 'eq', value: '大', offset: 15, valueOffsets: [20] }
            ]
          }
        }
      });
    });
  });

  describe('parseCondition：语法错误点名行 / 列（AC#5 语法面）', () => {
    it('意外字符 / 字符串未闭合 / 「!」误用', () => {
      expect(() => parseCondition('颜色 == 红')).toThrow(BomConfigSyntaxError);
      expect(() => parseCondition('颜色 == 红')).toThrow(/第 1 行第 5 列/);
      expect(() => parseCondition("颜色 = '红")).toThrow(/第 1 行第 6 列/);
      expect(() => parseCondition('!红')).toThrow(/第 1 行第 1 列/);
      expect(() => parseCondition('!红')).toThrow(/「!」后必须跟「=」/);
    });

    it('空条件 / 意外结束 / 多余记号', () => {
      expect(() => parseCondition('')).toThrow(/条件为空/);
      expect(() => parseCondition('   ')).toThrow(/条件为空/);
      expect(() => parseCondition('颜色 =')).toThrow(/第 1 行第 5 列/);
      expect(() => parseCondition('颜色 =')).toThrow(/意外结束：期望值/);
      expect(() => parseCondition('颜色 = 红 蓝')).toThrow(/第 1 行第 8 列/);
      expect(() => parseCondition('颜色 = 红 蓝')).toThrow(/多余记号/);
    });

    it('多行表达式按行 / 列点名', () => {
      expect(() => parseCondition('颜色 = 红\n尺寸 =')).toThrow(/第 2 行第 1 列/);
      expect(() => parseCondition('颜色 = 红\n尺寸 =')).toThrow(/多余记号标识「尺寸」/);
    });

    it('括号 / in 列表 / 原子结构错误', () => {
      expect(() => parseCondition('(颜色 = 红')).toThrow(/第 1 行第 8 列/);
      expect(() => parseCondition('(颜色 = 红')).toThrow(/缺右括号/);
      expect(() => parseCondition('颜色 in ()')).toThrow(/in 列表至少需要一个值/);
      expect(() => parseCondition('颜色 in (红,)')).toThrow(/第 1 行第 10 列/);
      expect(() => parseCondition('颜色 in 红')).toThrow(/in 后期望 \(值, 值, …\)/);
      expect(() => parseCondition('颜色 尺寸 = 红')).toThrow(/第 1 行第 4 列/);
      expect(() => parseCondition('颜色 尺寸 = 红')).toThrow(/期望 =、!= 或 in/);
    });

    it('错误对象点名表达式与字符偏移', () => {
      const error = caught(() => parseCondition('颜色 == 红'));
      expect(error).toBeInstanceOf(BomConfigSyntaxError);
      expect(error).toBeInstanceOf(BomConfigError);
      expect((error as BomConfigSyntaxError).offset).toBe(4);
      expect((error as BomConfigSyntaxError).expression).toBe('颜色 == 红');
    });

    it('positionText：行 / 列换算（多行与中文列宽）', () => {
      expect(positionText('颜色 = 红', 5)).toBe('第 1 行第 6 列');
      expect(positionText('颜色 = 红\n尺寸 =', 7)).toBe('第 2 行第 1 列');
      expect(positionText('ab', undefined)).toBe('');
    });
  });

  describe('evaluateCondition：AC#1 入选 / 落选', () => {
    it('= 要求选中集合恰含该值；未选中 = 空集合', () => {
      const ast = parseCondition('颜色 = 红').ast;
      expect(evaluateCondition(ast, { 颜色: ['红'] })).toBe(true);
      expect(evaluateCondition(ast, { 颜色: ['红', '蓝'] })).toBe(true);
      expect(evaluateCondition(ast, { 颜色: ['蓝'] })).toBe(false);
      expect(evaluateCondition(ast, {})).toBe(false);
      expect(evaluateCondition(ast, { 颜色: [] })).toBe(false);
    });

    it('!= 要求选中集合不含该值（未选中的特征也算不含）', () => {
      const ast = parseCondition('颜色 != 红').ast;
      expect(evaluateCondition(ast, { 颜色: ['蓝'] })).toBe(true);
      expect(evaluateCondition(ast, {})).toBe(true);
      expect(evaluateCondition(ast, { 颜色: ['红'] })).toBe(false);
    });

    it('in 要求选中集合与列表交集非空', () => {
      const ast = parseCondition('电池 in (10Ah, 15Ah)').ast;
      expect(evaluateCondition(ast, { 电池: ['10Ah'] })).toBe(true);
      expect(evaluateCondition(ast, { 电池: ['20Ah'] })).toBe(false);
      expect(evaluateCondition(ast, {})).toBe(false);
      expect(evaluateCondition(ast, { 电池: ['20Ah', '15Ah'] })).toBe(true);
    });

    it('NOT 只取布尔否定（未选中特征在 = 下为假，其 NOT 为真）', () => {
      const ast = parseCondition('NOT 颜色 = 红').ast;
      expect(evaluateCondition(ast, {})).toBe(true);
      expect(evaluateCondition(ast, { 颜色: ['红'] })).toBe(false);
      expect(evaluateCondition(ast, { 颜色: ['蓝'] })).toBe(true);
    });

    it('优先级 NOT > AND > OR', () => {
      // NOT 绑定最紧：(NOT A=红) AND B=蓝——与 NOT(A AND B) 在 A 真 B 假处区分
      const notAnd = parseCondition('NOT A = 红 AND B = 蓝').ast;
      expect(evaluateCondition(notAnd, { A: ['红'], B: [] })).toBe(false);
      expect(evaluateCondition(notAnd, { A: ['蓝'], B: ['蓝'] })).toBe(true);
      // OR 最低：A=红 OR (B=蓝 AND C=绿)——与 (A OR B) AND C 在 A 真 C 假处区分
      const orLowest = parseCondition('A = 红 OR B = 蓝 AND C = 绿').ast;
      expect(evaluateCondition(orLowest, { A: ['红'], B: ['蓝'], C: [] })).toBe(true);
      expect(evaluateCondition(orLowest, { A: ['蓝'], B: ['蓝'], C: ['绿'] })).toBe(true);
      expect(evaluateCondition(orLowest, { A: ['蓝'], B: ['蓝'], C: [] })).toBe(false);
    });

    it('组合条件与括号、引号字符串值（AC#1 典型选择条件）', () => {
      const ast = parseCondition(`颜色 = '红' AND 电池 in ("10Ah", "15Ah")`).ast;
      expect(evaluateCondition(ast, { 颜色: ['红'], 电池: ['10Ah'] })).toBe(true);
      expect(evaluateCondition(ast, { 颜色: ['蓝'], 电池: ['10Ah'] })).toBe(false);
      expect(evaluateCondition(ast, { 颜色: ['红'], 电池: ['20Ah'] })).toBe(false);
      const quoted = parseCondition('尺寸 = "中号"').ast;
      expect(evaluateCondition(quoted, { 尺寸: ['中号'] })).toBe(true);
    });
  });

  describe('validateConditionReferences：AC#5 保存期引用校验', () => {
    const knownChars = new Set(['颜色', '尺寸', '电池']);
    const knownValues = new Set(['红', '蓝', '10Ah', '15Ah', '大', '小']);

    it('已知引用不抛错（含引号字符串与 NOT）', () => {
      expect(() => validateConditionReferences('颜色 = 红', knownChars, knownValues)).not.toThrow();
      expect(() =>
        validateConditionReferences('尺寸 in (大, 小) OR NOT 颜色 != 红', knownChars, knownValues)
      ).not.toThrow();
      expect(() => validateConditionReferences(`颜色 = '红'`, knownChars, knownValues)).not.toThrow();
    });

    it('未知特征 / 值点名标识与位置', () => {
      expect(() => validateConditionReferences('温度 = 红', knownChars, knownValues)).toThrow(BomConfigError);
      expect(() => validateConditionReferences('温度 = 红', knownChars, knownValues)).toThrow(
        /未知特征「温度」（第 1 行第 1 列）/
      );
      expect(() => validateConditionReferences('颜色 = 绿', knownChars, knownValues)).toThrow(
        /未知值「绿」（第 1 行第 6 列）/
      );
      expect(() => validateConditionReferences('尺寸 in (红, 黑)', knownChars, knownValues)).toThrow(
        /未知值「黑」（第 1 行第 11 列）/
      );
    });

    it('多个未知标识一次性点名', () => {
      expect(() => validateConditionReferences('温度 = 绿', knownChars, knownValues)).toThrow(
        /未知特征「温度」（第 1 行第 1 列）；未知值「绿」（第 1 行第 6 列）/
      );
    });

    it('语法错误原样上抛（BomConfigSyntaxError 是 BomConfigError 子类）', () => {
      const error = caught(() => validateConditionReferences('颜色 =', knownChars, knownValues));
      expect(error).toBeInstanceOf(BomConfigSyntaxError);
      expect(error).toBeInstanceOf(BomConfigError);
    });
  });

  describe('checkConfigCompleteness：AC#3 必选特征完整性', () => {
    it('未赋值（缺失或空集合）的特征进清单，空 = 完整', () => {
      expect(checkConfigCompleteness({}, ['颜色'])).toEqual(['颜色']);
      expect(checkConfigCompleteness({ 颜色: [] }, ['颜色'])).toEqual(['颜色']);
      expect(checkConfigCompleteness({ 颜色: ['红'] }, ['颜色'])).toEqual([]);
      expect(checkConfigCompleteness({ 颜色: ['红'] }, ['颜色', '尺寸'])).toEqual(['尺寸']);
      expect(checkConfigCompleteness({}, [])).toEqual([]);
    });

    it('顺序随必选清单，重复 code 只报告一次', () => {
      expect(checkConfigCompleteness({ 尺寸: ['大'] }, ['颜色', '尺寸', '颜色'])).toEqual(['颜色']);
    });
  });

  describe('checkConfigConflicts：AC#2 约束冲突判定', () => {
    const left = parseCondition('颜色 = 红').ast;
    const right = parseCondition('尺寸 = 大').ast;
    const exclude: ConfigConstraintInput = { code: '红大互斥', kind: 'exclude', leftAst: left, rightAst: right };
    const require: ConfigConstraintInput = { code: '红必大', kind: 'require', leftAst: left, rightAst: right };

    it('exclude 互斥：两侧同时满足即冲突', () => {
      expect(checkConfigConflicts([exclude], { 颜色: ['红'], 尺寸: ['大'] })).toEqual([
        '约束「红大互斥」：左/右条件同时满足'
      ]);
      expect(checkConfigConflicts([exclude], { 颜色: ['红'], 尺寸: ['小'] })).toEqual([]);
      expect(checkConfigConflicts([exclude], { 颜色: ['蓝'], 尺寸: ['大'] })).toEqual([]);
      expect(checkConfigConflicts([exclude], {})).toEqual([]);
    });

    it('require 蕴含：左满足而右不满足即冲突', () => {
      expect(checkConfigConflicts([require], { 颜色: ['红'], 尺寸: ['小'] })).toEqual([
        '约束「红必大」：左条件满足而右条件不满足'
      ]);
      expect(checkConfigConflicts([require], { 颜色: ['红'], 尺寸: ['大'] })).toEqual([]);
      expect(checkConfigConflicts([require], { 颜色: ['蓝'], 尺寸: ['小'] })).toEqual([]);
      expect(checkConfigConflicts([require], {})).toEqual([]);
    });

    it('冲突清单按约束顺序返回多条', () => {
      const another: ConfigConstraintInput = {
        code: '电池禁红',
        kind: 'exclude',
        leftAst: left,
        rightAst: parseCondition('电池 in (10Ah, 15Ah)').ast
      };
      expect(checkConfigConflicts([exclude, another], { 颜色: ['红'], 尺寸: ['大'], 电池: ['10Ah'] })).toEqual([
        '约束「红大互斥」：左/右条件同时满足',
        '约束「电池禁红」：左/右条件同时满足'
      ]);
    });
  });

  describe('语法版本（语法升级不改旧条件含义）', () => {
    it('CONDITION_GRAMMAR_VERSION = 1，随 config_condition 实体持久化', () => {
      expect(CONDITION_GRAMMAR_VERSION).toBe('1');
      const condition: { grammarVersion: string; expression: string } = {
        grammarVersion: CONDITION_GRAMMAR_VERSION,
        expression: '颜色 = 红'
      };
      condition.grammarVersion = CONDITION_GRAMMAR_VERSION;
      condition.expression = '颜色 = 红';
      expect(condition.grammarVersion).toBe('1');
      expect(condition.expression).toBe('颜色 = 红');
    });
  });
});
