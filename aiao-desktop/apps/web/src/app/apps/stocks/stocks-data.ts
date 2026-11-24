/** 行情：价格 `p`、涨跌幅 `d`（百分比）。股票应用与小组件共用。 */
export interface Ticker {
  readonly s: string;
  readonly n: string;
  readonly p: number;
  readonly d: number;
  readonly up: boolean;
}

/** 自选股的初始内容（首次打开时写进库），之后以库里的 `WatchlistSymbol` 为准。 */
export const TICKER_SEEDS: readonly Ticker[] = [
  { s: 'AAPL', n: 'Apple Inc.', p: 232.4, d: 12.03, up: true },
  { s: 'MSFT', n: 'Microsoft Corp.', p: 505.8, d: -3.12, up: false },
  { s: 'NVDA', n: 'NVIDIA Corp.', p: 168.25, d: -6.22, up: false },
  { s: 'GOOGL', n: 'Alphabet Inc.', p: 204.11, d: 4.86, up: true },
  { s: 'TSLA', n: 'Tesla, Inc.', p: 318.94, d: 9.41, up: true },
  { s: 'AMZN', n: 'Amazon.com', p: 241.62, d: 1.08, up: true }
];

/** 库里一行自选股转成界面用的行情；涨跌由涨跌幅的正负决定。 */
export const toTicker = (row: {
  readonly symbol: string;
  readonly name: string;
  readonly price: number;
  readonly changePercent: number;
}): Ticker => ({ s: row.symbol, n: row.name, p: row.price, d: row.changePercent, up: row.changePercent >= 0 });

/** 按股票代码或公司名筛选本地演示自选股。 */
export function filterTickers(tickers: readonly Ticker[], query: string): readonly Ticker[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return tickers;
  return tickers.filter(ticker => `${ticker.s} ${ticker.n}`.toLocaleLowerCase().includes(normalized));
}

/** 输入框里的代码整理成大写代码；空白输入得到空串。 */
export const normalizeSymbol = (input: string): string => input.trim().toUpperCase();

/** 演示目录里有没有这个代码；加自选只接受种子里的公司。 */
export const tickerOf = (symbol: string): Ticker | undefined => TICKER_SEEDS.find(ticker => ticker.s === symbol);

/** 新自选股的 `position`：排在现有的最前；列表为空时从 0 开始。 */
export const nextWatchPosition = (positions: readonly number[]): number =>
  positions.length ? Math.min(...positions) - 1 : 0;

/** 拖动排序：把 `from` 位置的股票移到 `to`，返回每支股票新的 0..n-1 次序。 */
export const reorderPositions = (
  rows: readonly { symbol: string; position: number }[],
  from: number,
  to: number
): ReadonlyMap<string, number> => {
  const sorted = [...rows].sort((left, right) => left.position - right.position);
  const [moved] = sorted.splice(from, 1);
  if (!moved) return new Map();
  sorted.splice(Math.max(0, Math.min(to, sorted.length)), 0, moved);
  return new Map(sorted.map((row, index) => [row.symbol, index]));
};

/** 方向键移动选中：循环列表，空列表原地不动。 */
export const moveIndex = (current: number, delta: -1 | 1, count: number): number =>
  count > 0 ? (current + delta + count) % count : 0;
