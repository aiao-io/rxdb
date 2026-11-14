import type { RelationFieldError, RelationFieldErrors } from '../../interfaces/designer.interface';
import type { DetailTab, TableRecord } from './table.types';

/** 属性列的校验错误上下文 */
interface PropertyErrorCtx {
  propertyErrors: Map<string, { name?: boolean; columnName?: boolean }>;
  addRowNameError: boolean;
}

/** 关系列的校验错误上下文 */
interface RelationErrorCtx {
  invalidRelationIds: ReadonlySet<string>;
  relationFieldErrors: RelationFieldErrors;
  missingInverseRelationIds: ReadonlySet<string>;
}

/** 校验提示文案 */
interface ValidationHints {
  propertyNameHint: string;
  columnNameHint: string;
  relationNameHint: string;
  relationTargetEntityHint: string;
  relationMappedPropertyHint: string;
  missingInverseRelationHint: string;
}

/** 检测单元格是否有校验错误，返回错误状态和提示文案 */
export function detectCellError(
  tab: DetailTab,
  record: TableRecord,
  field: string | undefined,
  propCtx: PropertyErrorCtx,
  relCtx: RelationErrorCtx,
  hints: ValidationHints
): { isError: boolean; content?: string } {
  if (tab === 'properties') {
    if (field === 'name') {
      if (record['_isAddRow'] && propCtx.addRowNameError) {
        return { isError: true, content: hints.propertyNameHint };
      }
      if (record['_propId'] && propCtx.propertyErrors.get(record['_propId'] as string)?.name) {
        return { isError: true, content: hints.propertyNameHint };
      }
    }
    if (
      field === 'columnName' &&
      record['_propId'] &&
      propCtx.propertyErrors.get(record['_propId'] as string)?.columnName
    ) {
      return { isError: true, content: hints.columnNameHint };
    }
    return { isError: false };
  }

  if (tab === 'relations') {
    const relId = record['_relId'] as string | undefined;
    if (!relId) return { isError: false };

    const hasFieldError = field && relCtx.relationFieldErrors.get(relId)?.has(field as RelationFieldError);
    const hasMissingInverse = relCtx.missingInverseRelationIds.has(relId);
    if (!hasFieldError && !hasMissingInverse) return { isError: false };

    const fieldHints: Record<string, string> = {
      name: hints.relationNameHint,
      mappedEntityId: hints.relationTargetEntityHint,
      mappedPropertyId: hints.relationMappedPropertyHint
    };

    let content: string | undefined;
    if (hasFieldError && field) {
      content = fieldHints[field] ?? hints.relationTargetEntityHint;
    }
    if (hasMissingInverse) {
      content = content ? `${content} · ${hints.missingInverseRelationHint}` : hints.missingInverseRelationHint;
    }
    return { isError: true, content };
  }

  return { isError: false };
}
