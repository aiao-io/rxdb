/** 数字字符：中文小写、财务大写与 ASCII 数字 */
const DIGIT_MAP: Record<string, number> = {
  〇: 0,
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  壹: 1,
  贰: 2,
  叁: 3,
  肆: 4,
  伍: 5,
  陆: 6,
  柒: 7,
  捌: 8,
  玖: 9,
  0: 0,
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9
};

/** 段内单位：一个段的取值范围是 0 ~ 9999 */
const SECTION_UNIT_MAP: Record<string, number> = {
  十: 10,
  拾: 10,
  百: 100,
  佰: 100,
  千: 1000,
  仟: 1000
};

/** 段级单位：结算整个段 */
const SEGMENT_UNIT_MAP: Record<string, number> = {
  万: 10_000,
  亿: 100_000_000
};

const NEGATIVE_PREFIXES = ['负', '-'];

/**
 * 解析中文数字
 *
 * 采用「段级单位（万/亿）+ 段内单位（千/百/十）」两级模型，
 * 而不是逐字符的十进制位移 —— 后者无法表达 `十五万` 这类段级乘法（UTL-015）。
 *
 * 支持字符集：
 * - 数字：`〇零一二两三四五六七八九`、财务大写 `壹贰叁肆伍陆柒捌玖`、ASCII `0-9`
 * - 段内单位：`十拾百佰千仟`
 * - 段级单位：`万亿`
 * - 负号：以 `负` 或 `-` 开头
 *
 * 语义约定：
 * - 连续数字字符按位组成一个数（`10000` → 10000，`15万` → 150000）
 * - 段内单位必须严格递减（`一百千`、`十十` 抛错）
 * - 同一个段级单位不得连续复用（`一万二万` 抛错；`一万亿`、`一亿二千万` 合法）
 * - 末尾的裸数字落在个位（`一万一` → 10001，`一万一百一` → 10101）
 * - 单位前无数字时数量为 1（`十` → 10，`万` → 10000）
 *
 * @param s - 待解析字符串，允许首尾空白
 * @returns 解析出的数字
 * @throws {Error} 空输入、含不支持字符、单位顺序非法，或结果超出安全整数范围
 *
 * @example
 * ```ts
 * parseChineseNumber('十五万'); // 150000
 * parseChineseNumber('一亿二千万'); // 120000000
 * parseChineseNumber('负一百'); // -100
 * ```
 */
export function parseChineseNumber(s: string): number {
  const trimmed = s.trim();
  if (trimmed === '') {
    throw new Error('无法解析的数字: 空输入');
  }

  const negative = NEGATIVE_PREFIXES.some(prefix => trimmed.startsWith(prefix));
  const body = negative ? trimmed.slice(1) : trimmed;
  if (body === '') {
    throw new Error('无法解析的数字: 负号后没有数字');
  }

  // total 收敛已结算的段，section 是当前段，digits 是当前连续数字串
  let total = 0;
  let section = 0;
  let digits: number | null = null;
  let lastSectionUnit = Number.POSITIVE_INFINITY;
  let lastSegmentUnit: number | null = null;

  for (const char of body) {
    const digit = DIGIT_MAP[char];
    if (digit !== undefined) {
      digits = (digits ?? 0) * 10 + digit;
      continue;
    }

    const sectionUnit = SECTION_UNIT_MAP[char];
    if (sectionUnit !== undefined) {
      if (sectionUnit >= lastSectionUnit) {
        throw new Error(`单位顺序非法: ${char} 不能出现在更小的单位之后`);
      }
      lastSectionUnit = sectionUnit;
      section += (digits ?? 1) * sectionUnit;
      digits = null;
      continue;
    }

    const segmentUnit = SEGMENT_UNIT_MAP[char];
    if (segmentUnit === undefined) {
      throw new Error(`无法解析的数字: ${char}`);
    }
    if (segmentUnit === lastSegmentUnit) {
      throw new Error(`单位顺序非法: ${char} 不能连续复用`);
    }

    section += digits ?? 0;
    digits = null;
    // 「亿」结算它之前的全部内容（`一万亿`），「万」只结算当前段
    total =
      segmentUnit === SEGMENT_UNIT_MAP['亿'] ?
        (total + section || 1) * segmentUnit
      : total + (section || 1) * segmentUnit;
    section = 0;
    lastSectionUnit = Number.POSITIVE_INFINITY;
    lastSegmentUnit = segmentUnit;
  }

  const result = (total + section + (digits ?? 0)) * (negative ? -1 : 1);
  if (!Number.isSafeInteger(result)) {
    throw new Error(`无法解析的数字: 结果 ${result} 超出安全整数范围`);
  }
  return result;
}
