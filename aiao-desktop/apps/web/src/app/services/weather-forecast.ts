export interface ForecastPayload {
  readonly current: {
    readonly time: string;
    readonly temperature_2m: number;
    readonly weather_code: number;
    readonly is_day: number;
  };
  readonly hourly: {
    readonly time: readonly string[];
    readonly temperature_2m: readonly number[];
    readonly weather_code: readonly number[];
  };
  readonly daily: {
    readonly time: readonly string[];
    readonly weather_code: readonly number[];
    readonly temperature_2m_max: readonly number[];
    readonly temperature_2m_min: readonly number[];
  };
}

const invalid = (): never => {
  throw new Error('Invalid weather response');
};
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : invalid();
const finite = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : invalid());
const code = (value: unknown): number => {
  const number = finite(value);
  return Number.isInteger(number) && number >= 0 && number <= 99 ? number : invalid();
};
const date = (value: unknown, hourly: boolean): string => {
  const pattern = hourly ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/ : /^\d{4}-\d{2}-\d{2}$/;
  if (typeof value !== 'string' || !pattern.test(value)) return invalid();
  const timestamp = Date.parse(hourly ? `${value}Z` : `${value}T12:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().startsWith(value) ? value : invalid();
};
const array = <T>(value: unknown, parse: (item: unknown) => T, length?: number): readonly T[] => {
  if (!Array.isArray(value) || value.length === 0 || (length !== undefined && value.length !== length))
    return invalid();
  return value.map(parse);
};

/** 拒绝缺字段、无效日期、非有限数字及错位数组，不把错误响应当作历史天气。 */
export function parseForecast(value: unknown): ForecastPayload {
  const payload = record(value);
  const current = record(payload['current']);
  const hourly = record(payload['hourly']);
  const daily = record(payload['daily']);
  const hours = array(hourly['time'], value => date(value, true));
  const days = array(daily['time'], value => date(value, false));
  const minimums = array(daily['temperature_2m_min'], finite, days.length);
  const maximums = array(daily['temperature_2m_max'], finite, days.length);
  if (minimums.some((value, index) => value > maximums[index])) return invalid();
  if (current['is_day'] !== 0 && current['is_day'] !== 1) return invalid();
  return {
    current: {
      time: date(current['time'], true),
      temperature_2m: finite(current['temperature_2m']),
      weather_code: code(current['weather_code']),
      is_day: current['is_day']
    },
    hourly: {
      time: hours,
      temperature_2m: array(hourly['temperature_2m'], finite, hours.length),
      weather_code: array(hourly['weather_code'], code, hours.length)
    },
    daily: {
      time: days,
      temperature_2m_min: minimums,
      temperature_2m_max: maximums,
      weather_code: array(daily['weather_code'], code, days.length)
    }
  };
}
