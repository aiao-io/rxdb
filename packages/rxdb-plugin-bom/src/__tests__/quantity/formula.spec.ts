/**
 * @fileoverview 公式求值器单测（US-511 阶段 A：AC#3 / AC#14 的语法面）
 *
 * 受限语法：十进制字面量、`+ − × ÷`、括号、命名参数；缺参 / 语法错 / 除零 /
 * 负结果一律拒绝并点名，整次展开不跳过该行。
 */

import { describe, expect, it } from 'vitest';
import { assertFormulaSyntax, evaluateFormula, FORMULA_GRAMMAR_VERSION } from '../../quantity/formula.js';
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

  it('参数名与 Object 原型成员同名时按缺参拒绝（不沿原型链取到函数或原型对象）', () => {
    for (const name of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
      const error = (() => {
        try {
          evaluateFormula(`${name}*2`, {});
          return null;
        } catch (cause) {
          return cause;
        }
      })();
      expect(error, name).toBeInstanceOf(BomQuantityError);
      expect(String((error as Error).message), name).toContain(`缺参数 ${name}`);
    }
    expect(evaluateFormula('constructor*2', { constructor: '3' })).toBe('6');
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

  it('括号嵌套深度上限 64：上限内照常求值，超限与超深嵌套都抛领域错误（不是栈溢出 RangeError）', () => {
    const nested = (depth: number): string => `${'('.repeat(depth)}2${')'.repeat(depth)}`;
    expect(evaluateFormula(nested(64), {})).toBe('2');
    for (const depth of [65, 100_000]) {
      const error = (() => {
        try {
          evaluateFormula(nested(depth), {});
          return null;
        } catch (cause) {
          return cause;
        }
      })();
      expect(error, String(depth)).toBeInstanceOf(BomQuantityError);
      expect(String((error as Error).message), String(depth)).toContain('嵌套深度');
    }
  });
});

describe('公式纯语法校验（写入期，不需要参数值）', () => {
  it('合法公式放行：参数名不必给值，参数相关的除零只在求值期判定', () => {
    for (const formula of ['长*宽', '(长 + 宽) * 2 / 厚', 'a/(b-1)', '1.5E-3 * 密度', '2']) {
      expect(() => assertFormulaSyntax(formula), formula).not.toThrow();
    }
  });

  it('语法错、非法字面量与超深嵌套在写入期即拒绝（与求值期同一领域错误）', () => {
    const nested = `${'('.repeat(65)}2${')'.repeat(65)}`;
    for (const formula of ['长 *', '(长 + 宽', '长 宽', '1..2', '@', '', '1e99999', nested]) {
      expect(() => assertFormulaSyntax(formula), formula).toThrow(BomQuantityError);
    }
  });

  it('长链公式按循环求值：数万项的加减 / 乘除链不撑爆调用栈', () => {
    const terms = 20_000;
    const sum = Array.from({ length: terms }, () => 'x').join('+');
    expect(() => assertFormulaSyntax(sum)).not.toThrow();
    expect(evaluateFormula(sum, { x: '1' })).toBe(String(terms));
    expect(evaluateFormula(Array.from({ length: terms }, () => '1').join('*'), {})).toBe('1');
  });
});
