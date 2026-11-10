import { parseEntityFieldValue } from '../entity/entity-value.utils.js';
import type { EntityMetadata } from '../entity/metadata.interface.js';
import { PropertyType } from '../entity/property-types.interface.js';

/**
 * 把实体事件载荷里的日期还原成 `Date`。
 *
 * @param metadata - 事件所属实体的元数据；只处理声明为 {@link PropertyType.date} 的属性
 * @param data - 事件载荷展开后的实体数据（`patch` / `inversePatch`）
 * @returns 没有需要还原的值时原样返回 `data`；否则返回浅拷贝，输入不被修改
 *
 * @remarks
 * 合并 / 拉取路径（适配器的 `execute_switch_actions`、`handle_rxdb_change`）派发实体事件时，载荷取的是
 * 变更记录里的原始 JSON：JSON 没有 `Date`，日期属性是 ISO 字符串（或 epoch 毫秒）。
 * `PropertyType.date` 的运行时契约是 `Date`（见 `EntityBase.createdAt`），载荷原样造成实体，
 * 活查询推给订阅者的行里 `updatedAt.getTime()` 就会当场抛 `TypeError`。
 *
 * 只还原日期：其它类型的载荷要么本来就是运行时值，要么（如 `json` 属性里的字符串）
 * 单凭类型判断不了该不该解码。解析不出有效日期的值保持原样，不静默改成 `null`。
 */
export const restoreEventDates = <D extends Record<string, unknown>>(metadata: EntityMetadata, data: D): D => {
  let restored: Record<string, unknown> | undefined;
  for (const [key, value] of Object.entries(data)) {
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    if (metadata.propertyMap.get(key)?.type !== PropertyType.date) continue;
    const date = parseEntityFieldValue('date', value);
    if (date instanceof Date) (restored ??= { ...data })[key] = date;
  }
  return (restored ?? data) as D;
};
