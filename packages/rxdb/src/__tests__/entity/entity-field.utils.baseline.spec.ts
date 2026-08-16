/**
 * @fileoverview US-012 阶段 B — AC#25 冻结基线快照。
 *
 * 这个文件必须在改动 `entity-field.utils.ts` **之前**入库：先把
 * `extractEntityFields()` / `extractSystemFields()` 的现状落成快照，
 * 后续实施 DTO 时同一测试零 diff 才算没破坏 D5 冻结。
 *
 * `JSON.stringify` 保留键的插入顺序，因此字段增删、改名、顺序变化都会产生 diff。
 * 该阶段的 PR **禁止**执行 `--update-snapshot`：快照文件出现在改动列表里即视为违反冻结。
 */

import { describe, expect, it } from 'vitest';
import { extractEntityFields, extractSystemFields } from '../../entity/entity-field.utils.js';
import { BASELINE_ENTITIES } from '../fixtures/field-descriptor-entities.js';

describe('AC#25 — 旧字段导出的冻结基线', () => {
  it('extractEntityFields / extractSystemFields 的输出与入库快照逐字节一致', async () => {
    const baseline = BASELINE_ENTITIES.map(([label, metadata]) => ({
      entity: label,
      systemFields: extractSystemFields(metadata),
      entityFields: extractEntityFields(metadata)
    }));

    await expect(JSON.stringify(baseline, null, 2)).toMatchFileSnapshot(
      './__snapshots__/entity-field.utils.baseline.json'
    );
  });

  it('矩阵覆盖 AC#25 要求的全部字段形态', () => {
    const article = extractEntityFields(BASELINE_ENTITIES[0][1]);
    const names = new Set(article.map(field => field.field));

    // 系统字段被 extractEntityFields 排除，只出现在 extractSystemFields
    expect(extractSystemFields(BASELINE_ENTITIES[0][1]).map(field => field.field)).toEqual([
      'id',
      'createdAt',
      'updatedAt',
      'createdBy',
      'updatedBy'
    ]);
    ['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'].forEach(name => expect(names.has(name)).toBe(false));

    // 计算属性 / stringArray / 可空 / 唯一 / 加密
    expect(article.find(field => field.field === 'excerpt')?.type).toBe('computed');
    expect(names.has('tags')).toBe(true);
    expect(article.find(field => field.field === 'body')?.nullable).toBe(true);
    expect(article.find(field => field.field === 'title')?.unique).toBe(true);
    expect(names.has('secret')).toBe(true);

    // 四种关系：1:1 / m:1 落到外键字段，1:m / m:n 在旧导出里根本不出现
    expect(article.find(field => field.field === 'draftRevisionId')?.type).toBe('oneToOne');
    expect(article.find(field => field.field === 'authorId')?.type).toBe('manyToOne');
    expect(names.has('commentsId')).toBe(false);
    expect(names.has('topicsId')).toBe(false);

    // 非 uuid 主键：旧导出硬编码 id/UUID，主键叫 slug 时会漏报
    const topicSystem = extractSystemFields(BASELINE_ENTITIES[1][1]);
    expect(topicSystem).toEqual([{ field: 'id', displayName: 'ID', type: 'uuid', readonly: true }]);
    expect(extractEntityFields(BASELINE_ENTITIES[1][1]).map(field => field.field)).toEqual(['slug', 'label']);
  });
});
