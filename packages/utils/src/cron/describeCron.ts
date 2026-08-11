const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
const DAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

type CronFieldType = 'second' | 'minute' | 'hour' | 'day' | 'month' | 'dow';

/**
 * 单个字段项的语法形态。
 *
 * 字段语法：`field := '*' | item (',' item)*`，`item := ('*' | n | n '-' n) ['/' step]`。
 */
type CronItem =
  | { readonly kind: 'wildcard' }
  | { readonly kind: 'stepAll'; readonly step: number }
  | { readonly kind: 'value'; readonly value: number }
  | { readonly kind: 'valueStep'; readonly value: number; readonly step: number }
  | { readonly kind: 'range'; readonly start: number; readonly end: number }
  | { readonly kind: 'rangeStep'; readonly start: number; readonly end: number; readonly step: number };

interface CronFieldSpec {
  /** 报错文案中的字段名。 */
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly value: (value: number) => string;
  readonly range: (start: number, end: number) => string;
  readonly stepAll: (step: number) => string;
  readonly valueStep: (value: number, step: number) => string;
  readonly rangeStep: (start: number, end: number, step: number) => string;
  /** 纯数值列表（≥2 项）的紧凑渲染；`null` 表示逐项渲染后用「、」连接。 */
  readonly compactList: ((values: readonly number[]) => string) | null;
}

const monthLabel = (value: number): string => {
  const label = MONTHS[value - 1];
  if (label === undefined) throw new Error(`无效的 cron 表达式：月份 ${value} 超出范围 1-12`);
  return label;
};

const dowLabel = (value: number): string => {
  // 7 与 0 都表示周日，取模后落回 DAYS[0]。
  const label = DAYS[value % 7];
  if (label === undefined) throw new Error(`无效的 cron 表达式：星期 ${value} 超出范围 0-7`);
  return label;
};

const FIELD_SPECS: Record<CronFieldType, CronFieldSpec> = {
  second: {
    label: '秒',
    min: 0,
    max: 59,
    value: value => (value === 0 ? '整秒' : `第 ${value} 秒`),
    range: (start, end) => `${start} 到 ${end} 秒之间每秒`,
    stepAll: step => `每 ${step} 秒`,
    valueStep: (value, step) => `从第 ${value} 秒起每 ${step} 秒`,
    rangeStep: (start, end, step) => `${start} 到 ${end} 秒之间每 ${step} 秒`,
    compactList: values => `${values.join('、')} 秒`
  },
  minute: {
    label: '分钟',
    min: 0,
    max: 59,
    value: value => (value === 0 ? '整点' : `第 ${value} 分钟`),
    range: (start, end) => `${start} 到 ${end} 分之间每分钟`,
    stepAll: step => `每 ${step} 分钟`,
    valueStep: (value, step) => `从第 ${value} 分钟起每 ${step} 分钟`,
    rangeStep: (start, end, step) => `${start} 到 ${end} 分之间每 ${step} 分钟`,
    compactList: values => `${values.join('、')} 分`
  },
  hour: {
    label: '小时',
    min: 0,
    max: 23,
    value: value => `${value} 点`,
    range: (start, end) => `${start} 到 ${end} 点之间每小时`,
    stepAll: step => `每 ${step} 小时`,
    valueStep: (value, step) => `从 ${value} 时起每 ${step} 小时`,
    rangeStep: (start, end, step) => `${start} 到 ${end} 点之间每 ${step} 小时`,
    compactList: values => `${values.join('、')} 时`
  },
  day: {
    label: '日',
    min: 1,
    max: 31,
    value: value => `${value} 号`,
    range: (start, end) => `${start} 至 ${end} 号`,
    stepAll: step => `每隔 ${step} 天`,
    valueStep: (value, step) => `从 ${value} 号起每隔 ${step} 天`,
    rangeStep: (start, end, step) => `${start} 至 ${end} 号之间每隔 ${step} 天`,
    compactList: values => `${values.join('、')} 号`
  },
  month: {
    label: '月',
    min: 1,
    max: 12,
    value: monthLabel,
    range: (start, end) => `${monthLabel(start)}到${monthLabel(end)}`,
    stepAll: step => `每隔 ${step} 个月`,
    valueStep: (value, step) => `从${monthLabel(value)}起每隔 ${step} 个月`,
    rangeStep: (start, end, step) => `${monthLabel(start)}到${monthLabel(end)}每隔 ${step} 个月`,
    compactList: null
  },
  dow: {
    label: '星期',
    min: 0,
    max: 7,
    value: dowLabel,
    range: (start, end) => `${dowLabel(start)}到${dowLabel(end)}`,
    stepAll: step => `每 ${step} 周`,
    valueStep: (value, step) => `从${dowLabel(value)}起每 ${step} 周`,
    rangeStep: (start, end, step) => `${dowLabel(start)}到${dowLabel(end)}每隔 ${step} 天`,
    compactList: null
  }
};

const invalidField = (spec: CronFieldSpec, field: string, reason: string): Error =>
  new Error(`无效的 cron 表达式：${spec.label}字段 "${field}" ${reason}`);

const parseValue = (raw: string, spec: CronFieldSpec, field: string): number => {
  if (!/^\d+$/.test(raw)) throw invalidField(spec, field, `含非法取值 "${raw}"`);
  const value = Number(raw);
  if (value < spec.min || value > spec.max) {
    throw invalidField(spec, field, `取值 ${value} 超出范围 ${spec.min}-${spec.max}`);
  }
  return value;
};

const parseStep = (raw: string, spec: CronFieldSpec, field: string): number => {
  if (!/^\d+$/.test(raw)) throw invalidField(spec, field, `含非法步长 "${raw}"`);
  const step = Number(raw);
  if (step < 1) throw invalidField(spec, field, '的步长必须 ≥ 1');
  return step;
};

const parseItem = (raw: string, spec: CronFieldSpec, field: string): CronItem => {
  const [base, stepRaw, ...extraSteps] = raw.split('/');
  if (extraSteps.length > 0) throw invalidField(spec, field, `的分项 "${raw}" 含多余的 "/"`);
  const step = stepRaw === undefined ? null : parseStep(stepRaw, spec, field);

  if (base === '*') return step === null ? { kind: 'wildcard' } : { kind: 'stepAll', step };

  const [startRaw, endRaw, ...extraBounds] = base.split('-');
  if (extraBounds.length > 0) throw invalidField(spec, field, `的分项 "${raw}" 含多余的 "-"`);
  const start = parseValue(startRaw, spec, field);

  if (endRaw === undefined) {
    return step === null ? { kind: 'value', value: start } : { kind: 'valueStep', value: start, step };
  }

  const end = parseValue(endRaw, spec, field);
  if (end < start) throw invalidField(spec, field, `的范围 ${start}-${end} 起点大于终点`);
  return step === null ? { kind: 'range', start, end } : { kind: 'rangeStep', start, end, step };
};

/**
 * 解析并校验单个字段，语法或取值范围不合法立即抛错。
 *
 * 历史实现只校验字段段数，非法值一路生成伪描述（`0 0 1 0 *` → `1 号 00:00 执行`，
 * `* * * * abc` → `每周周NaN`），且 `1-5/2` 会被 `/` 分支吞掉 range（UTL-024）。
 */
const parseField = (raw: string, spec: CronFieldSpec): CronItem[] => {
  const items = raw.split(',').map(part => parseItem(part, spec, raw));
  if (items.length > 1 && items.some(item => item.kind === 'wildcard')) {
    throw invalidField(spec, raw, '中的 "*" 不能与其他分项并列');
  }
  return items;
};

const describeItem = (item: CronItem, spec: CronFieldSpec): string => {
  switch (item.kind) {
    case 'stepAll':
      return spec.stepAll(item.step);
    case 'value':
      return spec.value(item.value);
    case 'valueStep':
      return spec.valueStep(item.value, item.step);
    case 'range':
      return spec.range(item.start, item.end);
    case 'rangeStep':
      return spec.rangeStep(item.start, item.end, item.step);
    case 'wildcard':
      throw invalidField(spec, '*', '是通配符，不产生描述');
  }
};

/** 描述一个**确定不是通配符**的字段。 */
const describeFieldValue = (raw: string, type: CronFieldType): string => {
  const spec = FIELD_SPECS[type];
  const items = parseField(raw, spec);
  const bareValues = items.flatMap(item => (item.kind === 'value' ? [item.value] : []));
  if (spec.compactList && items.length > 1 && bareValues.length === items.length) {
    return spec.compactList(bareValues);
  }
  return items.map(item => describeItem(item, spec)).join('、');
};

/** 描述一个字段；`*` 返回 `null`。 */
const describeField = (raw: string, type: CronFieldType): string | null =>
  raw === '*' ? null : describeFieldValue(raw, type);

/** 时刻部分：优先渲染成 `HH:mm`，否则按字段描述拼接。 */
const describeClock = (min: string, hour: string): string => {
  const h = Number(hour);
  const m = Number(min);
  if (Number.isInteger(h) && Number.isInteger(m)) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  // 至少一侧不是 `*`（两侧都是 `*` 由 describeTime 的首个分支拦下）。
  return [describeField(hour, 'hour'), describeField(min, 'minute')].filter(Boolean).join(' ');
};

const describeTime = (min: string, hour: string, secDesc: string | null): string => {
  if (min === '*' && hour === '*') return secDesc ?? '每分钟';
  if (min.includes('/') && hour === '*') return describeFieldValue(min, 'minute');
  if (hour.includes('/') && min === '0') return `${describeFieldValue(hour, 'hour')}整点`;
  if (hour.includes('/') && min !== '*') return `${describeFieldValue(hour, 'hour')}的第 ${min} 分钟`;
  if (min === '0' && hour === '*') return '每小时整点';
  return describeClock(min, hour);
};

/**
 * 星期部分的措辞。
 *
 * `desc` 本身已带「周」前缀（`周一`、`周一到周三`）时只补「每」，不再拼一次「周」，
 * 否则会得到 `每周周一、周三` / `每周每 2 周`（UTL-024）。
 */
const describeWeekly = (raw: string, desc: string): string => {
  if (raw === '1-5') return '每个工作日';
  if (raw === '0,6' || raw === '6,0') return '每个周末';
  return desc.startsWith('周') ? `每${desc}` : desc;
};

function explain(sec: string | undefined, min: string, hour: string, day: string, month: string, dow: string): string {
  const secDesc = sec !== undefined && sec !== '*' && sec !== '0' ? describeFieldValue(sec, 'second') : null;

  let time = describeTime(min, hour, secDesc);
  if (secDesc && time !== secDesc) {
    time = `${time} ${secDesc}`;
  }

  const dayDesc = describeField(day, 'day');
  const monthDesc = describeField(month, 'month');
  const dowDesc = describeField(dow, 'dow');

  let when: string;
  if (dowDesc !== null && dayDesc === null) {
    when = describeWeekly(dow, dowDesc);
  } else if (dayDesc !== null && dowDesc === null) {
    when = monthDesc !== null ? `${monthDesc}${dayDesc}` : `每月 ${dayDesc}`;
  } else if (dayDesc !== null && dowDesc !== null) {
    when = `${dayDesc} 或 ${dowDesc}`;
  } else if (monthDesc !== null) {
    when = `每年${monthDesc}`;
  } else {
    when = '每天';
  }

  return `${when} ${time} 执行`;
}

export interface CronParts {
  second?: string;
  minute: string;
  hour: string;
  day: string;
  month: string;
  dow: string;
}

const validateParts = (parts: CronParts): void => {
  if (parts.second !== undefined) parseField(parts.second, FIELD_SPECS.second);
  parseField(parts.minute, FIELD_SPECS.minute);
  parseField(parts.hour, FIELD_SPECS.hour);
  parseField(parts.day, FIELD_SPECS.day);
  parseField(parts.month, FIELD_SPECS.month);
  parseField(parts.dow, FIELD_SPECS.dow);
};

/**
 * 解析 cron 表达式并返回各字段
 *
 * 支持标准 5 段格式（分 时 日 月 周）和 6 段格式（秒 分 时 日 月 周）。
 *
 * 每个字段都做**语法与取值范围**校验：
 * - 语法：`field := '*' | item (',' item)*`，`item := ('*' | n | n '-' n) ['/' step]`，
 *   `step ≥ 1`；范围起点不得大于终点；`*` 不能与其他分项并列。
 * - 取值：秒 `0-59`、分 `0-59`、时 `0-23`、日 `1-31`、月 `1-12`、周 `0-7`（0 与 7 均为周日）。
 *
 * @param expression - cron 表达式字符串
 * @returns 解析后的各字段对象（原样保留每段的字符串）
 * @throws `Error` 段数不是 5 或 6，或任一字段语法非法 / 取值越界
 *
 * @example
 * parseCron('0 9 * * 1-5');
 * // { minute: '0', hour: '9', day: '*', month: '*', dow: '1-5' }
 * @example
 * parseCron('0 0 1 13 *'); // 抛错：月字段 "13" 取值 13 超出范围 1-12
 */
export function parseCron(expression: string): CronParts {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5 && parts.length !== 6) {
    throw new Error(`无效的 cron 表达式：需要 5 或 6 段，实际为 ${parts.length} 段`);
  }

  const fields: CronParts =
    parts.length === 5 ?
      { minute: parts[0], hour: parts[1], day: parts[2], month: parts[3], dow: parts[4] }
    : { second: parts[0], minute: parts[1], hour: parts[2], day: parts[3], month: parts[4], dow: parts[5] };

  validateParts(fields);
  return fields;
}

/**
 * 将 cron 表达式翻译为中文自然语言描述
 *
 * 支持标准 5 段格式（分 时 日 月 周）和 6 段格式（秒 分 时 日 月 周）。
 * 字段语法与取值范围见 {@link parseCron}。
 *
 * @param expression - cron 表达式字符串
 * @returns 中文描述
 * @throws `Error` 表达式非法；非法输入不再降级成伪描述，调用方若用于 UI 展示需自行捕获（UTL-024）
 *
 * @example
 * describeCron('* * * * *');       // '每天 每分钟 执行'
 * describeCron('0 9 * * 1-5');     // '每个工作日 09:00 执行'
 * describeCron('0 0 1 1 *');       // '1月1 号 00:00 执行'
 * describeCron('30 18 * * 5');     // '每周五 18:30 执行'
 */
export function describeCron(expression: string): string {
  const { second, minute, hour, day, month, dow } = parseCron(expression);
  return explain(second, minute, hour, day, month, dow);
}

export interface CronPartsDescription {
  second?: string | null;
  minute: string | null;
  hour: string | null;
  day: string | null;
  month: string | null;
  dow: string | null;
}

/**
 * 将 cron 表达式中各字段翻译为中文标签
 *
 * 字段语法与取值范围见 {@link parseCron}。
 *
 * @param expression - cron 表达式字符串
 * @returns 各字段的中文描述，值为 null 表示该字段为通配符，5 段表达式不含 second
 * @throws `Error` 表达式非法
 *
 * @example
 * describeCronParts('0 9 * * 1-5');
 * // { minute: '整点', hour: '9 点', day: null, month: null, dow: '周一到周五' }
 */
export function describeCronParts(expression: string): CronPartsDescription {
  const parts = parseCron(expression);
  const result: CronPartsDescription = {
    minute: describeField(parts.minute, 'minute'),
    hour: describeField(parts.hour, 'hour'),
    day: describeField(parts.day, 'day'),
    month: describeField(parts.month, 'month'),
    dow: describeField(parts.dow, 'dow')
  };
  if (parts.second != null) {
    result.second = describeField(parts.second, 'second');
  }
  return result;
}
