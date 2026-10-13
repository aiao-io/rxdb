/**
 * @fileoverview @aiao/rxdb-plugin-bom 公共入口
 *
 * BOM（物料清单）领域插件：`item` / `item_revision` / `bom_header` / `bom_line` /
 * `bom_line_occurrence` 实体、BomRepository 门面（十进制值合同入口规范化）与
 * 存储层触发器（写入协议 / 结构列不可改 / 十进制格式）。
 */

export { BOM_ENTITIES, BomHeader, BomItem, BomItemRevision, BomLine, BomLineOccurrence } from './entities.js';
export { DECIMAL_CANONICAL_RE, DECIMAL_MAX_SIGNIFICANT_DIGITS, normalizeDecimalString } from './decimal.utils.js';
export { BomRepository } from './repository.js';
export {
  BOM_DECIMAL_FORMAT_PREFIX,
  BOM_PUBLISH_VALIDATION_PREFIX,
  BOM_WRITE_PROTOCOL_PREFIX,
  BomBackendCapabilityError,
  BomDecimalFormatError,
  BomError,
  BomPublishValidationError,
  BomWriteProtocolError,
  normalizeBomError
} from './types.js';
export { rxDBPluginBom, RxDBPluginBom } from './plugin.js';
