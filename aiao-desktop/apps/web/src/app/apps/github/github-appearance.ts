export const THEMES = ['light', 'dark', 'system'] as const;
export const TAB_SIZES = [1, 2, 3, 4, 5, 6, 8, 10, 12] as const;
export const DATE_FORMATS = [
  'MMM d, yyyy',
  'MMMM do, yyyy',
  'MM/dd/yyyy',
  'dd/MM/yyyy',
  'dd-MM-yyyy',
  'dd.MM.yyyy',
  'yyyy/MM/dd',
  'yyyy-MM-dd',
  'yyyy.MM.dd',
  'MM/dd/yy',
  'dd/MM/yy',
  'dd-MM-yy',
  'dd.MM.yy',
  'yy/MM/dd',
  'yy-MM-dd',
  'yy.MM.dd'
] as const;
export const TIME_FORMATS = [
  'HH:mm:ss',
  'HH.mm.ss',
  'HH:mm',
  'HH.mm',
  'h:mm:ss aaa',
  'h.mm.ss aaa',
  'h:mm aaa',
  'h.mm aaa'
] as const;
export const NUMBER_FORMATS = ['|.', '|,', ',|.', '.|,', ' |.', ' |,'] as const;

export interface GithubAppearance {
  readonly theme: (typeof THEMES)[number];
  readonly tabSize: (typeof TAB_SIZES)[number];
  readonly dateFormat: (typeof DATE_FORMATS)[number];
  readonly timeFormat: (typeof TIME_FORMATS)[number];
  readonly numberFormat: (typeof NUMBER_FORMATS)[number];
  readonly absoluteDates: boolean;
  readonly alwaysShowWorktree: boolean;
}

export const APPEARANCE_KEY = 'apps.github.appearance';
export const DEFAULT_APPEARANCE: GithubAppearance = {
  theme: 'system',
  tabSize: 4,
  dateFormat: 'MMM d, yyyy',
  timeFormat: 'h:mm aaa',
  numberFormat: '|.',
  absoluteDates: false,
  alwaysShowWorktree: false
};

export function isGithubAppearance(value: unknown): value is GithubAppearance {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Partial<GithubAppearance>;
  return (
    THEMES.some(theme => theme === settings.theme) &&
    TAB_SIZES.some(size => size === settings.tabSize) &&
    DATE_FORMATS.some(format => format === settings.dateFormat) &&
    TIME_FORMATS.some(format => format === settings.timeFormat) &&
    NUMBER_FORMATS.some(format => format === settings.numberFormat) &&
    typeof settings.absoluteDates === 'boolean' &&
    typeof settings.alwaysShowWorktree === 'boolean'
  );
}

const shortMonth = new Intl.DateTimeFormat('en', { month: 'short' });
const longMonth = new Intl.DateTimeFormat('en', { month: 'long' });
const ordinal = new Intl.PluralRules('en', { type: 'ordinal' });
const suffix = { zero: 'th', one: 'st', two: 'nd', few: 'rd', many: 'th', other: 'th' };
const twoDigits = (value: number): string => String(value).padStart(2, '0');

export function formatGithubDate(date: Date, pattern: GithubAppearance['dateFormat']): string {
  const day = date.getDate();
  const year = String(date.getFullYear());
  const parts: Record<string, string> = {
    yyyy: year,
    yy: year.slice(-2),
    MM: twoDigits(date.getMonth() + 1),
    MMM: shortMonth.format(date),
    MMMM: longMonth.format(date),
    dd: twoDigits(day),
    d: String(day),
    do: `${day}${suffix[ordinal.select(day)]}`
  };
  return pattern.replace(/yyyy|yy|MMMM|MMM|MM|dd|do|d/g, token => parts[token]);
}

export function formatGithubTime(date: Date, pattern: GithubAppearance['timeFormat']): string {
  const hour = date.getHours();
  const parts: Record<string, string> = {
    HH: twoDigits(hour),
    h: String(hour % 12 || 12),
    mm: twoDigits(date.getMinutes()),
    ss: twoDigits(date.getSeconds()),
    aaa: hour < 12 ? 'am' : 'pm'
  };
  return pattern.replace(/HH|h|mm|ss|aaa/g, token => parts[token]);
}

const numberParts = new Intl.NumberFormat('en-US');

export function formatGithubNumber(value: number, format: GithubAppearance['numberFormat']): string {
  const [group, decimal] = format.split('|');
  return numberParts
    .formatToParts(value)
    .map(part =>
      part.type === 'group' ? group
      : part.type === 'decimal' ? decimal
      : part.value
    )
    .join('');
}
