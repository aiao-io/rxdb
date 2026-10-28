/**
 * @fileoverview 写入入口的共用规则（仓储门面 / 整批导入 / 历史装载通道同一口径）
 *
 * - 十进制列：列与其存储层域取自十进制列登记（decimal-columns，backend 的格式触发器同源派生）。
 *   入口先把值规范成规范十进制串（语法、指数、34 位有效数字、非负，见 {@link normalizeDecimalString}），
 *   再按列校验域——阶梯边界 15 位、[0,1] 且小数至多 9 位的份额 / 概率 / 分摊比例、良率制损耗 [0,1)、
 *   正数的换算率 / 头基准量 / 标准成本批量。
 *   违约一律 {@link BomDecimalFormatError} 并点名列与域，不留到存储层才以笼统的「非规范串」拒绝。
 * - 公式行：qtyFormula 写入必须同时记录当前公式语法版本（{@link FORMULA_GRAMMAR_VERSION}）且能按该语法解析，
 *   与选择条件的语法版本同为写入期断言；语法升级后旧版本的公式不会被按新语法静默求值。
 */

import { DECIMAL_COLUMNS, type DecimalDomain } from '../decimal-columns.js';
import { normalizeDecimalString } from '../decimal.utils.js';
import { assertFormulaSyntax, FORMULA_GRAMMAR_VERSION } from '../quantity/formula.js';
import { BomDecimalFormatError, BomQuantityError } from '../types.js';

/**
 * 全部 BOM 实体的十进制列 → 存储层域（按列名，同名列在不同实体上同域；登记序即判域序）。
 */
export const DECIMAL_FIELD_DOMAINS: Readonly<Record<string, DecimalDomain>> = Object.fromEntries(
  DECIMAL_COLUMNS.map(({ field, domain }) => [field, domain])
);

/** 规范串的整数位数、小数位数与有效数字位数（有效数字 = 去小数点后去前导零，单个 0 计 1 位）。 */
const digitCounts = (canonical: string): { integer: number; fraction: number; significant: number } => {
  const [integer, fraction = ''] = canonical.split('.');
  const digits = `${integer}${fraction}`;
  let lead = 0;
  while (lead < digits.length - 1 && digits[lead] === '0') lead += 1;
  return { integer: integer.length, fraction: fraction.length, significant: digits.length - lead };
};

/** 规范串是否落在 [0,1] 且小数至多 9 位（`0`、`1` 或 `0.` 后至多 9 位）。 */
const isUnitFraction = (canonical: string): boolean =>
  canonical === '0' || canonical === '1' || (canonical.startsWith('0.') && canonical.length <= 11);

/** 按列校验规范串的存储层域；违约消息与存储层触发器同义。 */
const assertDomain = (field: string, canonical: string, domain: DecimalDomain, row: Record<string, unknown>): void => {
  if (domain.kind === 'lotsize') {
    const counts = digitCounts(canonical);
    if (counts.significant > 15 || counts.integer > 15 || counts.fraction > 15) {
      throw new BomDecimalFormatError(field, `阶梯边界限 15 位有效数字、整数与小数部分各 ≤ 15 位：${canonical}`);
    }
  }
  if (domain.kind === 'fraction' && !isUnitFraction(canonical)) {
    throw new BomDecimalFormatError(field, `${domain.label}限 [0,1]、小数至多 9 位：${canonical}`);
  }
  if (domain.kind === 'positive' && canonical === '0') {
    throw new BomDecimalFormatError(field, `${domain.label}必须大于 0：${canonical}`);
  }
  if (
    domain.kind === 'scrap' &&
    row[domain.convention] === 'yield' &&
    canonical !== '0' &&
    !canonical.startsWith('0.')
  ) {
    throw new BomDecimalFormatError(field, `良率制损耗必须在 [0,1)（s = 1 拒绝）：${canonical}`);
  }
};

/**
 * 把行上的十进制列规范成规范串，并按列校验存储层域（入口唯一的规范化点）。
 *
 * @param row - 实体或「补丁覆盖实体」的合并视图（良率制损耗按同一视图上的记法列判定）
 * @returns 规范化后的列值（列名 → 规范串）；值为 undefined / null 的列不出现，调用方据此回写
 * @throws {@link BomDecimalFormatError} 语法 / 指数 / 位数 / 负值 / 域违约
 */
export const normalizeDecimalColumns = (row: Record<string, unknown>): Record<string, string> => {
  const normalized: Record<string, string> = {};
  for (const [field, domain] of Object.entries(DECIMAL_FIELD_DOMAINS)) {
    const value = row[field];
    if (value === undefined || value === null) continue;
    normalized[field] = normalizeDecimalString(value, field);
    assertDomain(field, normalized[field], domain, row);
  }
  return normalized;
};

/**
 * 公式行的写入期断言：公式行（qty 为空、qtyFormula 非空）的 formulaGrammarVersion 必须是当前公式语法版本，
 * 公式文本须能按该版本语法解析。
 *
 * @remarks
 * qty 与 qtyFormula 同时非空不是公式行，由存储层「恰好一项」CHECK（qty_xor_formula）拒绝。
 * 语法在写入期即判定（与求值同一解析器）；缺参、除零与负结果依赖参数值，留在求值期。
 *
 * @param row - 行发生项（或补丁覆盖实体的合并视图）
 * @throws {@link BomQuantityError} 公式行缺语法版本、版本不受支持或公式语法错
 */
export const assertFormulaGrammar = (row: Record<string, unknown>): void => {
  const formula = row['qtyFormula'];
  if (formula === undefined || formula === null || (row['qty'] !== undefined && row['qty'] !== null)) return;
  const version = row['formulaGrammarVersion'];
  if (version !== FORMULA_GRAMMAR_VERSION) {
    throw new BomQuantityError(
      `公式 ${String(formula)} 的语法版本「${String(version)}」不受支持（当前 ${FORMULA_GRAMMAR_VERSION}），qtyFormula 须连同当前语法版本写入`
    );
  }
  if (typeof formula !== 'string') throw new BomQuantityError(`qtyFormula 必须是字符串：${String(formula)}`);
  assertFormulaSyntax(formula);
};
