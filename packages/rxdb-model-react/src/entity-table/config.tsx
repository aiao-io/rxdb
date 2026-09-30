/**
 * 实体表格配置（React Context 版）。
 *
 * @remarks
 * Angular 侧 `ENTITY_TABLE_CONFIG` 是 `InjectionToken`；React 等价物是 context，
 * 通过 `<ENTITY_TABLE_CONFIG.Provider value={config}>`（或 React 19 的
 * `<ENTITY_TABLE_CONFIG value={config}>`）注入全局表格配置。
 *
 * @module entity-table/config
 */
import type { EntityTableConfig } from '@aiao/rxdb-model';
import { createContext, type JSX } from 'react';

/**
 * 实体表格配置 context。
 *
 * @example
 * ```tsx
 * <ENTITY_TABLE_CONFIG.Provider value={{ tooltipDelay: 400 }}>
 *   <EntityTable records={records} columns={columns} />
 * </ENTITY_TABLE_CONFIG.Provider>
 * ```
 */
export const ENTITY_TABLE_CONFIG = createContext<EntityTableConfig | undefined>(undefined);

/**
 * 实体表格配置 Provider 组件（等价于直接使用 {@link ENTITY_TABLE_CONFIG.Provider}）。
 *
 * @param props - `value` 为表格配置，`children` 为消费子树
 */
export function EntityTableConfigProvider(props: {
  value: EntityTableConfig;
  children?: React.ReactNode;
}): JSX.Element {
  const { value, children } = props;
  return <ENTITY_TABLE_CONFIG.Provider value={value}>{children}</ENTITY_TABLE_CONFIG.Provider>;
}
