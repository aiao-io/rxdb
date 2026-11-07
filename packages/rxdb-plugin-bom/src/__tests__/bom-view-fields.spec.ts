import { describe, expect, it } from 'vitest';
import { bomEditorFields, parseBomEditorFields } from '../view-fields.js';

describe('共享 BOM 编辑表单', () => {
  const fields = {
    qty: '',
    componentScrap: '0',
    operationSeq: '',
    effectiveFrom: '2099-01-01T12:34:56.789',
    effectiveTo: ''
  };
  it('公式发生项的空用量恢复为null，不能存成非法空十进制字符串', () => {
    expect(parseBomEditorFields(fields)).toMatchObject({ qty: null, operationSeq: null, effectiveTo: null });
  });
  it('UTC毫秒原样往返，非空十进制仍交给仓储规范化', () => {
    const patch = parseBomEditorFields({ ...fields, qty: '1.00', operationSeq: '20' });
    expect(patch).toMatchObject({ qty: '1.00', operationSeq: 20 });
    expect(patch.effectiveFrom?.toISOString()).toBe('2099-01-01T12:34:56.789Z');
    expect(bomEditorFields(null)).toMatchObject({ qty: '', effectiveFrom: '', effectiveTo: '' });
  });
  it('生效期按 UTC 墙钟呈现，往返不随运行机时区平移', () => {
    const value = {
      occurrenceId: 'occurrence',
      qty: '1',
      componentScrap: '0',
      operationSeq: null,
      effectiveFrom: new Date('2099-01-01T00:00:00.000Z'),
      effectiveTo: new Date('2099-01-02T03:04:05.006Z'),
      editable: true,
      readOnlyReason: null
    };
    const display = bomEditorFields(value);
    expect(display).toMatchObject({ effectiveFrom: '2099-01-01T00:00:00.000', effectiveTo: '2099-01-02T03:04:05.006' });
    expect(parseBomEditorFields(display)).toMatchObject({
      effectiveFrom: value.effectiveFrom,
      effectiveTo: value.effectiveTo
    });
  });
});
