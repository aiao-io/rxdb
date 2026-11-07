import { RELATION_KINDS } from '../../constants';

/** 根据 source 和 target 的关系类型确定边的标记类型 */
export function normalizeRelationKindForMarker(sourceKind: string, targetKind: string): string {
  if (sourceKind === 'MANY_TO_MANY' || targetKind === 'MANY_TO_MANY') {
    return RELATION_KINDS.MANY_TO_MANY;
  }
  if (sourceKind === 'ONE_TO_MANY') {
    return RELATION_KINDS.ONE_TO_MANY;
  }
  if (sourceKind === 'MANY_TO_ONE') {
    return RELATION_KINDS.MANY_TO_ONE;
  }
  return RELATION_KINDS.ONE_TO_ONE;
}

/** 获取关系类型的箭头标记配置 */
export function getEdgeMarkers(relationKind: string): { sourceMarker?: object; targetMarker?: object } {
  switch (relationKind) {
    case RELATION_KINDS.MANY_TO_MANY:
      return {
        sourceMarker: { name: 'classic', size: 8 },
        targetMarker: { name: 'classic', size: 8 }
      };
    case RELATION_KINDS.ONE_TO_MANY:
      return {
        sourceMarker: undefined,
        targetMarker: { name: 'classic', size: 8 }
      };
    case RELATION_KINDS.MANY_TO_ONE:
      return {
        sourceMarker: { name: 'classic', size: 8 },
        targetMarker: undefined
      };
    case RELATION_KINDS.ONE_TO_ONE:
    default:
      return {
        sourceMarker: { name: 'circle', size: 4 },
        targetMarker: { name: 'circle', size: 4 }
      };
  }
}
