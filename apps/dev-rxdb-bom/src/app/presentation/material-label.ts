const MATERIAL_NAMES = new Map<string, string>([
  ['SC-100', '电动滑板车'],
  ['FRAME', '车架'],
  ['PCBA', '控制板'],
  ['MCU', '主控芯片'],
  ['MCU-V2', '主控芯片（二代）'],
  ['R10K', '10kΩ 电阻'],
  ['R10K-ALT1', '10kΩ 电阻替代件一'],
  ['R10K-ALT2', '10kΩ 电阻替代件二'],
  ['WH-01', '线束组件'],
  ['WIRE', '导线'],
  ['TERMINAL', '接线端子'],
  ['SHRINK', '热缩管'],
  ['BATT', '电池组'],
  ['CELL', '电池电芯'],
  ['BMS', '电池管理板'],
  ['BMS-V2', '电池管理板（二代）'],
  ['M3', 'M3 螺钉'],
  ['HOUSING', '外壳'],
  ['SHEET', '钣金板材'],
  ['OFFCUT', '可回收余料'],
  ['TRIM', '裁切废料'],
  ['P-MATERIAL', '工序原料'],
  ['COVER-ASSY', '外壳装配组件'],
  ['PROCESS-01', '加工演示组件'],
  ['SEAT', '座椅'],
  ['SEAT-LIVE', '新增座椅'],
  ['ECN-DEMO', '工程变更演示组件'],
  ['DEMO-PART', '工程变更演示零件'],
  ['SHEET-ASSY', '钣金外壳设计件'],
  ['SHEET-ASSY-M', '钣金外壳制造件'],
  ['WIP-BEND', '折弯半成品'],
  ['WIP-CUT', '下料半成品'],
  ['MCU-DIE', '芯片裸片'],
  ['DIE-PART', '裸片零件'],
  ['COST-DEMO', '缺成本演示组件'],
  ['COST-MISSING', '未维护成本零件'],
  ['B-01', '合规演示件'],
  ['UNIT-DEMO', '序列适用性演示组件'],
  ['UNIT-PART-OLD', '旧版适用零件'],
  ['UNIT-PART-NEW', '新版适用零件'],
  ['CONFIG-DEMO', '颜色配置演示组件'],
  ['CONFIG-PART', '红色配置零件'],
  ['JOINT-MAIN', '联产主产品'],
  ['JOINT-RAW', '联产原料'],
  ['JOINT-CO', '联产品'],
  ['JOINT-CONSUMER', '联产品下游组件']
]);

export const materialName = (itemNo: string): string => MATERIAL_NAMES.get(itemNo) ?? '未命名物料';

export const materialLabel = (itemNo: string): string => `${materialName(itemNo)}（${itemNo}）`;

/** 物料 id → 业务编码；映射缺项说明数据不一致，显式标「未知物料」并保留完整 id 供追查。 */
export const itemNoById = (itemNos: ReadonlyMap<string, string>, itemId: string): string =>
  itemNos.get(itemId) ?? `未知物料（${itemId}）`;

/** 物料 id → 「中文名（编码）」；缺项不再套名称，直接给出未知物料与完整 id。 */
export const itemLabelById = (itemNos: ReadonlyMap<string, string>, itemId: string): string => {
  const itemNo = itemNos.get(itemId);
  return itemNo === undefined ? itemNoById(itemNos, itemId) : materialLabel(itemNo);
};
