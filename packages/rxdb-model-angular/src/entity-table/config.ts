import type { EntityTableConfig } from '@aiao/rxdb-model';
import { InjectionToken } from '@angular/core';

/**
 * 实体表格配置注入令牌
 * 用于在 Angular 应用中注入全局实体表格配置
 */
export const ENTITY_TABLE_CONFIG = new InjectionToken<EntityTableConfig>('ENTITY_TABLE_CONFIG');
