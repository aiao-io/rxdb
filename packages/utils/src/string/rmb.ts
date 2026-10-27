const fraction = ['角', '分', '厘'];
const digit = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
const unit = [
  ['元', '万', '亿', '兆', '京', '垓'],
  ['', '拾', '佰', '仟']
];

const max = Math.pow(10, 22);

/**
 * 转换人民币大写
 *
 * 小数部分按四舍五入精确到厘，满一元进位（`0.9999` → `壹元整`）。
 *
 * @param value - 金额，负数以「欠」开头
 * @returns 大写金额
 * @throws {TypeError} value 不是有限数
 * @throws {Error} 绝对值超过 10^22
 */
export const rmbUppercase = (value: number) => {
  // 非有限数没有金额语义，且下面的字符串拆分对它们全部失效
  if (!Number.isFinite(value)) {
    throw new TypeError(`rmbUppercase: value 必须是有限数，收到 ${String(value)}`);
  }

  const head = value < 0 ? '欠' : '';
  const amount = Math.abs(value);

  if (amount > max) {
    throw new Error(`max value is ${max}`);
  }

  // 不能靠 `${num}`.split('.')[1] 取小数部分：绝对值 < 1e-6 时 JS 用科学计数法（UTL-016）。
  // 小数部分一次取整成「厘」后全程整数运算：除回小数再逐位乘 10 会重新引入浮点误差
  // （0.59 → 伍角捌分），满 1000 厘必须进位到元（0.9999 → 壹元整）
  let num = Math.floor(amount);
  let li = Math.round((amount - num) * 1000);
  if (li === 1000) {
    num += 1;
    li = 0;
  }
  const fractionDigits = [Math.floor(li / 100), Math.floor(li / 10) % 10, li % 10];
  let str = fractionDigits.map((d, i) => (d === 0 ? '' : digit[d] + fraction[i])).join('') || '整';

  for (let i = 0; i < unit[0].length && num > 0; i++) {
    let p = '';
    for (let j = 0; j < unit[1].length && num > 0; j++) {
      p = digit[num % 10] + unit[1][j] + p;
      num = Math.floor(num / 10);
    }
    str = p.replace(/(零.)*零$/g, '').replace(/^$/, '零') + unit[0][i] + str;
  }
  return `${head}${str
    .replace(/(零.)*零元/, '元')
    .replace(/(零.)+/g, '零')
    .replace(/^整$/, '零元整')}`;
};
