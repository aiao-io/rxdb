/** 有限数的十进制表示：`mantissa × 10^-scale`，取 `String(value)` 的最短往返写法（`0.28` → 28 × 10^-2） */
const toDecimal = (value: number): { mantissa: bigint; scale: number } => {
  const [coefficient, exponent = '0'] = String(value).split('e');
  const [integer, fraction = ''] = coefficient.split('.');
  const scale = fraction.length - Number(exponent);
  const digits = BigInt(integer + fraction);
  return scale >= 0 ? { mantissa: digits, scale } : { mantissa: digits * 10n ** BigInt(-scale), scale: 0 };
};

/**
 * 将数值向上取整到最接近的步长倍数
 * 常用于表单控件、网格布局等需要按固定间隔取值的场景
 *
 * @param value - 需要取整的数值
 * @param step - 步长间隔，必须为正有限数
 * @returns 向上取整后的数值，是step的整数倍
 * @throws {RangeError} step 不是正有限数
 * @example
 * numberStep(7, 5);   // 返回 10（5的2倍）
 * @example
 * numberStep(5, 5);   // 返回 5（5的1倍）
 * @example
 * numberStep(3.2, 2); // 返回 4（2的2倍）
 * @example
 * numberStep(0.28, 0.01); // 返回 0.28（已对齐，不因 0.28 / 0.01 的二进制误差多进一步）
 * **注意：** value 与 step 按各自的最短十进制写法（`String(n)`）在整数域里计算，
 * 结果与十进制心算一致、不带浮点尾巴；负数同样向上取整（`numberStep(-7, 3)` → -6）；
 * value 为 NaN / ±Infinity 时原样返回
 */
export const numberStep = (value: number, step: number) => {
  if (!Number.isFinite(step) || step <= 0) {
    throw new RangeError(`step must be a positive finite number, got ${step}`);
  }
  if (!Number.isFinite(value)) return Math.ceil(value / step) * step;
  const amount = toDecimal(value);
  const unit = toDecimal(step);
  const scale = Math.max(amount.scale, unit.scale);
  const units = unit.mantissa * 10n ** BigInt(scale - unit.scale);
  const scaled = amount.mantissa * 10n ** BigInt(scale - amount.scale);
  // BigInt 除法向零截断：正数补一个 (units - 1) 才是向上取整，负数截断本身就是向上取整
  const multiple = scaled > 0n ? (scaled + units - 1n) / units : scaled / units;
  return Number(`${multiple * units}e-${scale}`);
};
