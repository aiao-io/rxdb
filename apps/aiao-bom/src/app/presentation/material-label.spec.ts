import {
  COPRODUCT_DATASET,
  SCOOTER_DATASET,
  SCOOTER_DATASET_D,
  SCOOTER_DATASET_E
} from '@aiao/rxdb-plugin-bom/testing';
import { describe, expect, it } from 'vitest';
import { itemLabelById, itemNoById, materialLabel, materialName } from './material-label';

describe('演示物料名称', () => {
  it('所有示例物料都有中文名称，保留可核对的完整编码', () => {
    const scooterKeys = [SCOOTER_DATASET, SCOOTER_DATASET_D, SCOOTER_DATASET_E].flatMap(dataset =>
      dataset.items.map(item => item.key)
    );
    const keys = [
      ...scooterKeys,
      'HOUSING',
      'SHEET',
      'OFFCUT',
      'TRIM',
      'R10K-ALT1',
      'R10K-ALT2',
      'P-MATERIAL',
      'COVER-ASSY',
      'PROCESS-01',
      'SEAT',
      'MCU-V2',
      'BMS-V2',
      'ECN-DEMO',
      'DEMO-PART',
      COPRODUCT_DATASET.primaryKey,
      COPRODUCT_DATASET.coproductKey,
      COPRODUCT_DATASET.rawKey,
      COPRODUCT_DATASET.consumerKey,
      'SEAT-LIVE'
    ];

    for (const code of keys) {
      expect(materialName(code)).toMatch(/[\u4e00-\u9fff]/);
      expect(materialName(code)).not.toBe('未命名物料');
      expect(materialLabel(code)).toBe(`${materialName(code)}（${code}）`);
    }
  });

  it('常用零件先显示易懂名称', () => {
    expect(materialLabel('PCBA')).toBe('控制板（PCBA）');
    expect(materialLabel('BATT')).toBe('电池组（BATT）');
    expect(materialLabel('R10K')).toBe('10kΩ 电阻（R10K）');
    // 设计与制造两张清单挂在同一物料上，名称不再分设计件 / 制造件
    expect(materialLabel('SHEET-ASSY')).toBe('钣金外壳（SHEET-ASSY）');
  });

  it('未命名的导入物料明确提示缺名称，完整编码仍可识别', () => {
    expect(materialName('CUSTOM-001')).toBe('未命名物料');
    expect(materialLabel('CUSTOM-001')).toBe('未命名物料（CUSTOM-001）');
  });

  it('物料 id 映射缺项显式标出未知物料并保留完整 id，不截断成看似正常的短码', () => {
    const itemNos = new Map([['pcba-id', 'PCBA']]);
    const missing = '0f8fad5b-d9cb-469f-a165-70867728950e';

    expect(itemNoById(itemNos, 'pcba-id')).toBe('PCBA');
    expect(itemLabelById(itemNos, 'pcba-id')).toBe('控制板（PCBA）');
    expect(itemNoById(itemNos, missing)).toBe(`未知物料（${missing}）`);
    expect(itemLabelById(itemNos, missing)).toBe(`未知物料（${missing}）`);
  });
});
