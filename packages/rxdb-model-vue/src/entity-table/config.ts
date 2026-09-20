import type { EntityTableConfig } from '@aiao/rxdb-model';
import type { InjectionKey } from 'vue';

/**
 * 实体表格配置注入键（对齐 Angular 侧的 `ENTITY_TABLE_CONFIG` DI 令牌）。
 *
 * 应用层通过 `provide(ENTITY_TABLE_CONFIG, { tooltipDelay: 200 })` 提供全局配置；
 * 未提供时使用默认值。
 */
export const ENTITY_TABLE_CONFIG: InjectionKey<EntityTableConfig> = Symbol('ENTITY_TABLE_CONFIG');
