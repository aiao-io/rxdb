import { BomResolutionError } from './resolve/resolution.js';
import type { BomEditorFields, BomLineEditorValue, BomOccurrencePatch } from './view-types.js';

/** 三框架原生编辑表单的字段、标签和输入类型。 */
export const BOM_EDITOR_INPUTS: readonly { field: keyof BomEditorFields; label: string; type: string }[] = [
  { field: 'qty', label: '用量', type: 'text' },
  { field: 'componentScrap', label: '组件损耗', type: 'text' },
  { field: 'operationSeq', label: '投料工序', type: 'number' },
  { field: 'effectiveFrom', label: '生效起点', type: 'datetime-local' },
  { field: 'effectiveTo', label: '生效终点', type: 'datetime-local' }
];

/** 原样呈现领域错误消息及结构化信息，不在框架层重建业务错误。 */
export const bomErrorText = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error);
  const code = 'code' in error ? String(error.code) : '';
  const payload = 'payload' in error ? JSON.stringify(error.payload) : '';
  return [error.message, code, payload].filter(Boolean).join('\n');
};

/** 把领域编辑值映射为 UTC 原生表单字段；空目标使用空字符串。 */
export const bomEditorFields = (value: BomLineEditorValue | null): BomEditorFields => ({
  qty: value?.qty ?? '',
  componentScrap: value?.componentScrap ?? '',
  operationSeq: value?.operationSeq == null ? '' : String(value.operationSeq),
  effectiveFrom: value?.effectiveFrom.toISOString().slice(0, -1) ?? '',
  effectiveTo: value?.effectiveTo?.toISOString().slice(0, -1) ?? ''
});

const dateField = (field: string, value: string): Date => {
  const date = new Date(`${value}Z`);
  if (!Number.isFinite(date.getTime())) throw new BomResolutionError(field, '需要有效的 UTC 日期时间');
  return date;
};

/** 三端共用的表单转换；十进制值仍由仓储规范化，空工序与结束日期表示 null。 */
export const parseBomEditorFields = (fields: BomEditorFields): BomOccurrencePatch => {
  const operationSeq = fields.operationSeq === '' ? null : Number(fields.operationSeq);
  if (operationSeq !== null && (!Number.isSafeInteger(operationSeq) || operationSeq < 1)) {
    throw new BomResolutionError('operationSeq', '投料工序必须是正整数或留空');
  }
  return {
    qty: fields.qty === '' ? null : fields.qty,
    componentScrap: fields.componentScrap,
    operationSeq,
    effectiveFrom: dateField('effectiveFrom', fields.effectiveFrom),
    effectiveTo: fields.effectiveTo === '' ? null : dateField('effectiveTo', fields.effectiveTo)
  };
};

/** 三框架使用相同视觉规则；原生控件、状态与焦点拥有清晰对比度。 */
export const BOM_VIEW_STYLES = `
.bom-view { color: #172337; font: 15px/1.5 system-ui, sans-serif; }
.bom-tree, .bom-line-editor { background: #fff; border: 1px solid #c7d2df; border-radius: 8px; padding: 16px; }
.bom-tree [role=tree] { list-style: none; margin: 0; padding: 0; }
.bom-tree [role=treeitem] { min-height: 40px; border-bottom: 1px solid #e4eaf0; padding: 4px 0; }
.bom-view button, .bom-view input { font: inherit; border: 1px solid #718096; border-radius: 4px; padding: 6px 10px; }
.bom-view button { color: #172337; background: #f2f6fa; cursor: pointer; }
.bom-view :focus-visible { outline: 3px solid #1459b8; outline-offset: 2px; }
.bom-view :disabled { opacity: .65; cursor: default; }
.bom-view [role=alert] { color: #9b1c1c; }
.bom-line-editor label { display: grid; gap: 4px; margin-bottom: 12px; }
.bom-line-editor input { color: #172337; background: #fff; min-width: 0; }
.bom-node-content { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.bom-node-quantity { font-variant-numeric: tabular-nums; }
.bom-view [role=status] { color: #40516a; }
`;
