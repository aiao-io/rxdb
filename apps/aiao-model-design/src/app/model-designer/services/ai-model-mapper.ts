import type { AiEntityContext } from '../types/ai-schemas';

/** 有效的 PropertyType 值集合 */
const VALID_PROPERTY_TYPES = new Set([
  'uuid',
  'string',
  'number',
  'integer',
  'boolean',
  'date',
  'stringArray',
  'numberArray',
  'keyValue',
  'json',
  'enum'
]);

/** AI 输出常见类型 → 标准 PropertyType 映射 */
const TYPE_MAPPING: Record<string, string> = {
  text: 'string',
  varchar: 'string',
  char: 'string',
  float: 'number',
  double: 'number',
  decimal: 'number',
  real: 'number',
  bigint: 'integer',
  long: 'integer',
  int: 'integer',
  smallint: 'integer',
  tinyint: 'integer',
  timestamp: 'date',
  datetime: 'date',
  time: 'date',
  array: 'stringArray',
  list: 'stringArray',
  object: 'json',
  map: 'json',
  jsonb: 'json',
  bool: 'boolean',
  bit: 'boolean',
  id: 'uuid',
  guid: 'uuid'
};

/**
 * 属性类型降级映射
 *
 * 非标准类型按预定义映射转换，无法匹配则降级为 string + console.warn。
 */
export function normalizePropertyType(rawType: string): string {
  const lower = rawType.toLowerCase();
  if (VALID_PROPERTY_TYPES.has(lower)) return lower;
  const mapped = TYPE_MAPPING[lower];
  if (mapped) return mapped;
  console.warn(`[ai-model-populate] Unknown property type "${rawType}", falling back to "string"`);
  return 'string';
}

/**
 * 实体名 PascalCase 规范化
 *
 * snake_case/kebab-case/camelCase → PascalCase。
 */
export function normalizeEntityName(name: string): string {
  const pascal = name
    .split(/[-_]/)
    .map(seg => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join('');
  if (pascal !== name) {
    console.warn(`[ai-model-populate] Entity name "${name}" normalized to "${pascal}"`);
  }
  return pascal;
}

/**
 * 将 AI 实体输出映射为 RxDB 实体创建参数
 */
export function mapEntityToRxDB(
  entity: Pick<AiEntityContext, 'name' | 'displayName'>,
  nodeX: number,
  nodeY: number,
  nodeWidth: number
) {
  return {
    name: entity.name,
    displayName: entity.displayName ?? entity.name,
    nodeX,
    nodeY,
    nodeWidth
  };
}

/**
 * 过滤不完整实体（无 name 的）
 */
export function filterIncompleteEntities(entities: AiEntityContext[]): AiEntityContext[] {
  return entities.filter(e => !!e.name);
}

/**
 * SSE 中断时保留已完整解析的实体
 *
 * 丢弃最后一个不完整实体（无 name 或无 properties），保留其余。
 * 返回保留的完整实体列表。
 */
export function retainCompleteEntities(entities: Partial<AiEntityContext>[]): AiEntityContext[] {
  const complete: AiEntityContext[] = [];
  for (const e of entities) {
    if (e.name && Array.isArray(e.properties)) {
      complete.push({
        id: e.id ?? crypto.randomUUID(),
        name: e.name,
        displayName: e.displayName,
        entityNamespace: e.entityNamespace,
        properties: e.properties,
        relations: e.relations ?? [],
        indexes: e.indexes ?? []
      });
    }
  }
  return complete;
}
