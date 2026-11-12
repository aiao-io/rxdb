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
