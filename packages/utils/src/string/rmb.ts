const fraction = ['角', '分', '厘'];
const digit = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
const unit = [
  ['元', '万', '亿', '兆', '京', '垓'],
  ['', '拾', '佰', '仟']
];

const max = Math.pow(10, 22);

/**
 * 转换人民币大写
 * @param value
 * @returns
 */
export const rmbUppercase = (value: number) => {
  // 非有限数没有金额语义，且下面的字符串拆分对它们全部失效
  if (!Number.isFinite(value)) {
    throw new TypeError(`rmbUppercase: value 必须是有限数，收到 ${String(value)}`);
  }

  const head = value < 0 ? '欠' : '';
  let num = Math.abs(value);

  if (num > max) {
    throw new Error(`max value is ${max}`);
  }

  let str = '';
  if (value > Math.floor(value)) {
    // 不能靠 `${num}`.split('.')[1] 取小数部分：绝对值 < 1e-6 时 JS 用科学计数法
    // （`${1e-7}` 是 `'1e-7'`），split 结果为 undefined → `Number('0.undefined')` 得到 NaN，
    // 最终输出里混入 `undefined`。改为在「厘」精度上做整数运算（UTL-016）
    const n = Math.round((num - Math.floor(num)) * 1000) / 1000;
    str = fraction.reduce(
      (p, c, i) => p + (digit[Math.floor(n * 10 * Math.pow(10, i)) % 10] + c).replace(/零./, ''),
      ''
    );
  }
  str = str || '整';
  num = Math.floor(num);

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
