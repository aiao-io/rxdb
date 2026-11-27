import type { EntityMetadataOptions } from '../../entity/entity-options.interface.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';
import { PropertyType } from '../../entity/property-types.interface.js';

/** 包含原生 JSON、JSON 文本、普通列与加密源的存储声明测试元数据。 */
export const storageMetadata = (overrides: Partial<EntityMetadataOptions> = {}) =>
  transitionMetadata({
    name: 'StorageItem',
    namespace: 'bom',
    tableName: 'item',
    properties: [
      { name: 'id', type: PropertyType.uuid, primary: true },
      { name: 'ext', columnName: 'ext_json', type: PropertyType.string, nullable: true },
      { name: 'native', type: PropertyType.json, nullable: true },
      { name: 'dictionary', type: PropertyType.keyValue, properties: [{ name: 'flag', type: PropertyType.boolean }] },
      { name: 'title', type: PropertyType.string },
      { name: 'score', type: PropertyType.number },
      { name: 'secret', type: PropertyType.string, encrypted: true }
    ],
    computedProperties: [],
    relations: [],
    indexes: [],
    ...overrides
  });
