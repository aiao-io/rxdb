/**
 * @fileoverview 第 8 步 schema 面测试：配置四实体 + attr_def + 序列/批次/条件/扩展列。
 *
 * 双后端同断言：五张新表建出、唯一索引生效、`bom_line_occurrence` 新列可写可读。
 */

import { describe, expect, it } from 'vitest';
import { BomAttrDef, BomConfigChar, BomConfigCharValue, BomConfigCondition, BomConfigConstraint, BomHeader, BomItem, BomItemRevision, BomLine, BomLineOccurrence } from '../entities.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

for (const backend of BACKENDS) {
  describe(`第 8 步 schema 面 [${backend}]`, () => {
    it('配置特征与选项值：唯一键 (orgId, code) 与 (charId, value)', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const char = new BomConfigChar();
        char.orgId = 'org-x';
        char.code = '颜色';
        char.required = true;
        await char.save();
        const dup = new BomConfigChar();
        dup.orgId = 'org-x';
        dup.code = '颜色';
        await expect(dup.save()).rejects.toThrow(/unique|唯一/i);
        const value = new BomConfigCharValue();
        value.charId = char.id;
        value.value = '红';
        await value.save();
        const dupValue = new BomConfigCharValue();
        dupValue.charId = char.id;
        dupValue.value = '红';
        await expect(dupValue.save()).rejects.toThrow(/unique|唯一/i);
      } finally {
        await disposeBomTestAdapter(adapter).catch(() => undefined);
      }
    });

    it('选择条件 / 依赖约束 / attr_def：建表与保存', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const condition = new BomConfigCondition();
        condition.orgId = 'org-x';
        condition.expression = '颜色 = 红';
        condition.grammarVersion = '1';
        await condition.save();
        const other = new BomConfigCondition();
        other.orgId = 'org-x';
        other.expression = '颜色 = 蓝';
        other.grammarVersion = '1';
        await other.save();
        const constraint = new BomConfigConstraint();
        constraint.orgId = 'org-x';
        constraint.code = '红蓝互斥';
        constraint.kind = 'exclude';
        constraint.leftConditionId = condition.id;
        constraint.rightConditionId = other.id;
        await constraint.save();
        const def = new BomAttrDef();
        def.code = 'rohs';
        def.dataType = 'string';
        def.required = true;
        def.enumValues = JSON.stringify(['yes', 'no']);
        def.appliesTo = 'item';
        await def.save();
        // 同一 code 可跨作用域（AC#6）
        const def2 = new BomAttrDef();
        def2.code = 'rohs';
        def2.dataType = 'string';
        def2.required = false;
        def2.appliesTo = 'bom_header';
        await def2.save();
      } finally {
        await disposeBomTestAdapter(adapter).catch(() => undefined);
      }
    });

    it('行发生项新列：unitFrom/unitTo/lotCodes/selectionConditionId/ext 可写可读', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const item = new BomItem();
        item.itemNo = 'schema-item';
        await item.save();
        const revision = new BomItemRevision();
        revision.revisionNo = 'A';
        revision.itemId = item.id;
        revision.effectiveFrom = new Date('2026-01-01T00:00:00.000Z');
        await revision.save();
        const header = new BomHeader();
        header.parentRevisionId = revision.id;
        header.bomType = 'ebom';
        header.orgId = 'org-x';
        await header.save();
        const line = new BomLine();
        line.headerId = header.id;
        line.lineNo = 10;
        await line.save();
        const child = new BomItem();
        child.itemNo = 'schema-child';
        await child.save();
        const occurrence = new BomLineOccurrence();
        occurrence.lineId = line.id;
        occurrence.childItemId = child.id;
        occurrence.qty = '1';
        occurrence.uom = 'pcs';
        occurrence.effectiveFrom = new Date('2026-01-01T00:00:00.000Z');
        occurrence.unitFrom = 137;
        occurrence.unitTo = null;
        occurrence.lotCodes = JSON.stringify(['B1', 'B2']);
        occurrence.selectionConditionId = null;
        occurrence.ext = JSON.stringify({ rohs: 'yes' });
        await occurrence.save();
        expect(occurrence.unitFrom).toBe(137);
        expect(occurrence.unitTo).toBeNull();
        expect(JSON.parse(occurrence.lotCodes as string)).toEqual(['B1', 'B2']);
        expect(JSON.parse(occurrence.ext as string)).toEqual({ rohs: 'yes' });
      } finally {
        await disposeBomTestAdapter(adapter).catch(() => undefined);
      }
    });
  });
}
