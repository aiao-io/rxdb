import type { I18n } from '@aiao/rxdb-i18n';
import { domainModelZhMessages } from '../i18n/domain-messages';
import type { WorkbenchEntityEntry } from './entity-registry';

const declaredMessages: Readonly<Record<string, string>> = domainModelZhMessages;

/** 按实体身份读取显示名；未知业务实体继续使用其声明名称。 */
export function entityDisplayName(entry: WorkbenchEntityEntry, translate?: I18n['t']): string {
  const key = `entity.${entry.namespace}.${entry.name}.displayName`;
  return declaredMessages[key] === undefined ?
      entry.displayName
    : (translate?.(key, undefined, 'rxdb-model') ?? declaredMessages[key]);
}

/** 按搜索命中的属性或关系读取显示标签，字段标识与记录值保持不变。 */
export function fieldDisplayName(entry: WorkbenchEntityEntry, field: string, translate?: I18n['t']): string {
  const prefix = `entity.${entry.namespace}.${entry.name}`;
  const relation = field.endsWith('Id') ? field.slice(0, -2) : field;
  const key = [`${prefix}.property.${field}`, `${prefix}.relation.${relation}`].find(
    candidate => declaredMessages[candidate] !== undefined
  );
  return key === undefined ? field : (translate?.(key, undefined, 'rxdb-model') ?? declaredMessages[key]);
}
