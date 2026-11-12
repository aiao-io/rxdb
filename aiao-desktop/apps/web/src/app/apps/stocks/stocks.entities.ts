import { Entity, EntityBase, EntityType, PropertyType } from '@aiao/rxdb';

/**
 * 自选股里的一支股票，`position` 决定它在列表里的位置。
 * 价格与涨跌幅是最近一次行情的快照：这里没有外网行情源，种子里的读数就是初始值，之后由行情刷新改写这两列。
 */
@Entity({
  name: 'WatchlistSymbol',
  tableName: 'watchlist_symbol',
  namespace: 'desktop',
  properties: [
    { name: 'symbol', type: PropertyType.string, required: true, unique: true },
    { name: 'name', type: PropertyType.string, required: true },
    { name: 'price', type: PropertyType.number, required: true },
    { name: 'changePercent', columnName: 'change_percent', type: PropertyType.number, required: true },
    { name: 'position', type: PropertyType.integer, required: true }
  ]
})
export class WatchlistSymbol extends EntityBase {
  /** 股票代码，例如 `AAPL`。 */
  declare symbol: string;
  /** 公司名。 */
  declare name: string;
  /** 现价。 */
  declare price: number;
  /** 涨跌幅（百分比，负数是跌）。 */
  declare changePercent: number;
  /** 在自选列表里的次序，从 0 起。 */
  declare position: number;
}

/** 股票应用要在桌面库里登记的实体。 */
export const STOCKS_ENTITIES: readonly EntityType[] = [WatchlistSymbol];
