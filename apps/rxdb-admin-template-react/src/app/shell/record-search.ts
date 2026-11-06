import type { RxDB } from '@aiao/rxdb';
import type { PaletteItem, PaletteSource } from '@aiao/rxdb-admin';
import { filter, firstValueFrom } from 'rxjs';
import { visibleEntityEntries } from '../entities/entity-registry';

const ADAPTER = 'sqlite-wasm';
const MAX_RECORDS = 8;

/**
 * 命令面板的「数据记录」来源：对接全文搜索插件，命中后跳到该记录所属实体的列表。
 *
 * @remarks
 * 只在本地适配器已连接时搜索——查询会触发自动连接，而空库恢复流程（/backup 先恢复后连接）
 * 要求连接前不能有任何查询，面板不能破坏这个前置。
 * @param rxdb - 工作台的 RxDB 实例。
 * @param navigate - 路由跳转。
 * @returns 异步来源。
 */
export function createRecordSearchSource(rxdb: RxDB, navigate: (url: string) => void): PaletteSource {
  const entries = visibleEntityEntries(rxdb.config.entities);
  return {
    id: 'records',
    groupLabelKey: 'palette.group.records',
    minQueryLength: 1,
    search: async (query, signal) => {
      if (!(await firstValueFrom(rxdb.adapterConnected$(ADAPTER)))) return [];
      const handle = rxdb.search('', { debounce: 0, pageSize: MAX_RECORDS, snippetLength: 48 });
      signal.addEventListener('abort', () => handle.destroy());
      try {
        const settled = firstValueFrom(handle.state$.pipe(filter(state => state !== 'idle' && state !== 'loading')));
        handle.setQuery(query);
        if ((await settled) === 'error') throw new Error('Record search failed');
        // state$ 与 results$ 派生自同一份快照：状态到达的瞬间 results$ 还可能是旧值，结算后再单独取最新结果
        const results = await firstValueFrom(handle.results$);
        return results.map<PaletteItem>(result => {
          const entry = entries.find(candidate => candidate.name === result.entity);
          return {
            id: `record:${result.collection}:${result.id}`,
            label: result.snippet,
            sublabel: `${entry?.displayName ?? result.entity} · ${result.matchedField}`,
            run: () => entry && navigate(`/entities/${entry.namespace}/${entry.name}`)
          };
        });
      } finally {
        handle.destroy();
      }
    }
  };
}
