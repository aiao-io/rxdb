import type { RxDB, TransactionExecutor } from '@aiao/rxdb';

import type { DataSeed } from '../../data/seeds';
import { TICKER_SEEDS } from './stocks-data';
import { WatchlistSymbol } from './stocks.entities';

/** 股票的初始数据：六支自选股，次序与原来一致。 */
export const STOCKS_SEED: DataSeed = {
  domain: 'stocks',
  version: 1,
  async run(executor: TransactionExecutor, rxdb: RxDB): Promise<void> {
    const watchlist = executor.getRepository(WatchlistSymbol);
    for (const [position, ticker] of TICKER_SEEDS.entries()) {
      const symbol = { symbol: ticker.s, name: ticker.n, price: ticker.p, changePercent: ticker.d, position };
      await watchlist.create(rxdb.entityManager.instantiate(WatchlistSymbol, symbol));
    }
  }
};
