/**
 * @fileoverview 公式求值器单测（US-511 阶段 A：AC#3 / AC#14 的语法面）
 *
 * 受限语法：十进制字面量、`+ − × ÷`、括号、命名参数；缺参 / 语法错 / 除零 /
 * 负结果一律拒绝并点名，整次展开不跳过该行。
 */

import { describe, expect, it } from 'vitest';
import { evaluateFormula, FORMULA_GRAMMAR_VERSION } from '../../quantity/formula.js';
import { BomQuantityError } from '../../types.js';

describe('公式求值器：四则与优先级', () => {
  it('四则与括号', () => {
    expect(evaluateFormula('1+2', {})).toBe('3');
    expect(evaluateFormula('2*3+4', {})).toBe('10');
    expect(evaluateFormula('(2+3)*4', {})).toBe('20');
    expect(evaluateFormula('10/4', {})).toBe('2.5');
    expect(evaluateFormula('10-4-2', {})).toBe('4');
  });

  it('指数写法字面量入口规范化', () => {
    expect(evaluateFormula('1.5E-3 + 0', {})).toBe('0.0015');
    expect(evaluateFormula('1.50 * 2', {})).toBe('3');
  });

  it('34 位 golden：210/0.97（AC#20 除法段）', () => {
    expect(evaluateFormula('210/0.97', {})).toBe('216.4948453608247422680412371134021');
  });

  it('空白与括号深度', () => {
    expect(evaluateFormula('  ( 1 + 2 ) * ( 3 - 1 )  ', {})).toBe('6');
  });

  it('语法版本是常量并可持久化', () => {
    expect(FORMULA_GRAMMAR_VERSION).toBe('1');
  });
});

describe('公式求值器：命名参数（AC#3）', () => {
  it('参数参与计算且随参数变化', () => {
    const formula = '长*宽*厚*密度';
    expect(evaluateFormula(formula, { 长: '3', 宽: '4', 厚: '0.5', 密度: '7.85' })).toBe('47.1');
    expect(evaluateFormula(formula, { 长: '3', 宽: '2', 厚: '0.5', 密度: '7.85' })).toBe('23.55');
  });

  it('参数值走入口规范化（指数写法可用）', () => {
    expect(evaluateFormula('a*b', { a: '1E3', b: '0.002' })).toBe('2');
  });
});

describe('公式求值器：拒绝语义（AC#14）', () => {
  it('缺参数拒绝并点名参数名', () => {
    try {
      evaluateFormula('长*宽', { 长: '3' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BomQuantityError);
      expect(String((error as Error).message)).toContain('宽');
    }
  });

  it('语法错误拒绝', () => {
    for (const bad of ['1+', '1..2', 'a b', '', '()', '*3']) {
      expect(() => evaluateFormula(bad, {}), bad).toThrow(BomQuantityError);
    }
  });

  it('除零拒绝', () => {
    expect(() => evaluateFormula('1/0', {})).toThrow(BomQuantityError);
  });

  it('负结果拒绝（首期没有负需求）', () => {
    expect(() => evaluateFormula('1-2', {})).toThrow(BomQuantityError);
  });
});
