/** 一个主产物在当前生产批中的产量与显式分配份额。 */
export interface JointCostOutputInput {
  kind: 'primary' | 'coproduct';
  itemId: string;
  revisionId: string;
  lineId: string | null;
  occurrenceId: string | null;
  lineNo: number | null;
  qty: string;
  uom: string;
  share: string;
}

/** 分配后的批成本与单位成本，金额保持规范十进制串。 */
export interface JointCostOutput extends JointCostOutputInput {
  batchCost: string;
  unitCost: string;
}

/** 过程净联合成本与全部主产物的稳定分配结果。 */
export interface JointCostSummary {
  netCost: string;
  outputs: readonly JointCostOutput[];
}

/**
 * 按整批共同34位量子和固定份额分配净成本，最后正份额输出接精确尾差。
 *
 * @param netCost - 现有 kernel 核算的整批净联合成本
 * @param outputs - 含第一主产物的完整有效输出集合
 * @returns 稳定排序、分配批成本精确合计为净成本的输出
 */
export const allocateJointCost = (netCost: string, outputs: readonly JointCostOutputInput[]): JointCostSummary => {
  const ordered = [...outputs].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'primary' ? -1 : 1;
    const line = (left.lineNo ?? 0) - (right.lineNo ?? 0);
    if (line !== 0) return line;
    const leftKey = `${left.lineId ?? ''}:${left.occurrenceId ?? ''}`;
    const rightKey = `${right.lineId ?? ''}:${right.occurrenceId ?? ''}`;
    return (
      leftKey < rightKey ? -1
      : leftKey > rightKey ? 1
      : 0
    );
  });
  if (ordered.filter(output => output.kind === 'primary').length !== 1)
    throw new BomCostError('联产分配', '需要唯一第一主产物');
  const shares = ordered.map(output => shareUnits(output.share));
  if (shares.reduce((sum, share) => sum + share, 0n) !== 1000000000n)
    throw new BomCostError('联产分配', '份额合计必须精确为1');
  for (const output of ordered) {
    if (decimalCmp(decimalFromCanonical(output.qty), { coeff: 0n, exp: 0 }) <= 0)
      throw new BomCostError('联产分配', '输出数量必须大于0');
  }
  const cost = decimalFromCanonical(netCost);
  const digits = (cost.coeff < 0n ? -cost.coeff : cost.coeff).toString().length;
  if (digits > 34) throw new BomCostError('联产分配', '净成本超过34位有效数字');
  const exponent = cost.coeff === 0n ? 0 : cost.exp + digits - 34;
  const units = cost.coeff * 10n ** BigInt(cost.exp - exponent);
  const last = shares.findLastIndex(share => share > 0n);
  let assigned = 0n;
  const amounts = shares.map((share, index) => {
    if (share === 0n || index === last) return 0n;
    const amount = halfEven(units * share, 1000000000n);
    assigned += amount;
    return amount;
  });
  amounts[last] = units - assigned;
  return {
    netCost: decimalToCanonical(cost),
    outputs: ordered.map((output, index) => {
      const amount = { coeff: amounts[index], exp: exponent };
      return {
        ...output,
        batchCost: decimalToCanonical(amount),
        unitCost: decimalToCanonical(decimalDiv(amount, decimalFromCanonical(output.qty)))
      };
    })
  };
};
import { BomCostError } from './cost-error.js';
import { decimalCmp, decimalDiv, decimalFromCanonical, decimalToCanonical } from './decimal.js';

const shareUnits = (share: string): bigint => {
  if (!/^(?:0|1|0\.[0-9]{0,8}[1-9])$/.test(share))
    throw new BomCostError('jointCostShare', '必须是[0,1]内至多9位小数的规范串');
  const [integer, fraction = ''] = share.split('.');
  return BigInt(integer) * 1000000000n + BigInt(fraction.padEnd(9, '0'));
};

const halfEven = (numerator: bigint, denominator: bigint): bigint => {
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const rounded =
    quotient + (remainder * 2n > denominator || (remainder * 2n === denominator && quotient % 2n !== 0n) ? 1n : 0n);
  return negative ? -rounded : rounded;
};
