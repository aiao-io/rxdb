import type { EntityType } from '@aiao/rxdb';

import { DesktopFile } from '../disk/desktop-file.entity';
import { SystemPreference } from './system-preference.entity';

/**
 * 桌面库的全部实体。各内置应用把自己的实体数组展开到这里（每个应用一行），
 * storage 插件的文件元数据实体由插件自己登记。
 */
export const DESKTOP_ENTITIES: readonly EntityType[] = [SystemPreference, DesktopFile];
