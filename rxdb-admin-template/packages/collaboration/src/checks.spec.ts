import type { FieldValidationRule } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { checkMerged, checkMessage, checkRecords, type CheckRule, type MergeView } from './checks.js';
import { collaborationEnglish } from './messages.js';
import type { Records, SchemaManifest } from './model.js';
import { planningSchema } from './planning.testing.js';
import { choose, pick, seeded } from './random.testing.js';
import { rowAt } from './records.js';
import { isMissing, recordKeys, recordKeyText, schemaModel } from './schema.js';
import { assetSchema } from './schema.testing.js';

const describeChecks = (schema: SchemaManifest, records: Records) =>
  checkRecords(schema, records).map(check => `${check.recordId}.${check.field}: ${check.message}`);
const category = { c: { entity: 'AssetCategory', fields: { name: 'Category' } } };

describe('资产清单驱动的检查（与旧版写死规则的语义对照）', () => {
  it('名称缺失、为 null 或只有空白只报必填，不参与唯一性比较', () => {
    expect(
      describeChecks(assetSchema, {
        ...category,
        absent1: { entity: 'Asset', fields: { categoryId: 'c' } },
        absent2: { entity: 'Asset', fields: { categoryId: 'c' } },
        blank1: { entity: 'Asset', fields: { name: '  ', categoryId: 'c' } },
        blank2: { entity: 'Asset', fields: { name: '  ', categoryId: 'c' } },
        bare: { entity: 'AssetCategory', fields: {} },
        nulled: { entity: 'Asset', fields: { name: null, categoryId: 'c' } }
      })
    ).toEqual([
      'absent1.name: 必填文本不能为空',
      'absent2.name: 必填文本不能为空',
      'bare.name: 必填文本不能为空',
      'blank1.name: 必填文本不能为空',
      'blank2.name: 必填文本不能为空',
      'nulled.name: 必填文本不能为空'
    ]);
  });

  it('同一实体的同名记录只有按标识排在后面的报唯一；不同实体、维护记录的事项不比较', () => {
    expect(
      describeChecks(assetSchema, {
        ...category,
        first: { entity: 'Asset', fields: { name: 'Laptop', categoryId: 'c' } },
        second: { entity: 'Asset', fields: { name: 'Laptop', categoryId: 'c' } },
        third: { entity: 'AssetCategory', fields: { name: 'Laptop' } },
        e1: { entity: 'AssetEvent', fields: { summary: 'Same', happenedAt: '2026-01-01', assetId: 'first' } },
        e2: { entity: 'AssetEvent', fields: { summary: 'Same', happenedAt: '2026-01-01', assetId: 'first' } }
      })
    ).toEqual(['second.name: 名称必须唯一']);
  });

  it('缺失、为 null、不是文本或指向别的实体的外键都是关联记录不存在', () => {
    expect(
      describeChecks(assetSchema, {
        7: { entity: 'AssetCategory', fields: { name: 'Numeric id' } },
        nulled: { entity: 'Asset', fields: { name: 'Nulled', categoryId: null } },
        absent: { entity: 'Asset', fields: { name: 'Absent' } },
        numeric: { entity: 'Asset', fields: { name: 'Numeric', categoryId: 7 } },
        wrong: { entity: 'Asset', fields: { name: 'Wrong', categoryId: 'numeric' } },
        event: { entity: 'AssetEvent', fields: { summary: 'Event', happenedAt: '2026-01-01', assetId: null } }
      })
    ).toEqual([
      'absent.categoryId: 关联记录不存在',
      'event.assetId: 关联记录不存在',
      'nulled.categoryId: 关联记录不存在',
      'numeric.categoryId: 关联记录不存在',
      'wrong.categoryId: 关联记录不存在'
    ]);
  });

  it('金额不能为负、必须是数字，日期必须是真实存在的日期，事项与日期必填', () => {
    expect(
      describeChecks(assetSchema, {
        ...category,
        a: { entity: 'Asset', fields: { name: 'A', categoryId: 'c', purchasePrice: -1, purchaseDate: '2026-02-30' } },
        b: { entity: 'Asset', fields: { name: 'B', categoryId: 'c', purchasePrice: '12', status: 3 } },
        e: { entity: 'AssetEvent', fields: { summary: '', assetId: 'a', cost: 0, happenedAt: null } },
        f: { entity: 'AssetEvent', fields: { summary: 'F', assetId: 'a', happenedAt: 1735689600000 } }
      })
    ).toEqual([
      'a.purchasePrice: 必须为非负数',
      'a.purchaseDate: 日期无效',
      'b.status: 必须为文本',
      'b.purchasePrice: 必须为数字',
      'e.summary: 必填文本不能为空',
      'e.happenedAt: 日期不能为空',
      'f.happenedAt: 日期无效'
    ]);
  });

  it('取值不合格的不参与唯一性比较：名称不是文本只报类型，不再报重名', () => {
    expect(
      describeChecks(assetSchema, {
        ...category,
        a: { entity: 'Asset', fields: { name: 5, categoryId: 'c' } },
        b: { entity: 'Asset', fields: { name: 5, categoryId: 'c' } }
      })
    ).toEqual(['a.name: 必须为文本', 'b.name: 必须为文本']);
  });

  it('删除仍被引用的记录，报错落在引用它的记录上', () => {
    expect(
      describeChecks(assetSchema, {
        a: { entity: 'Asset', fields: { name: 'A', categoryId: 'deleted' } },
        e: { entity: 'AssetEvent', fields: { summary: 'E', happenedAt: '2026-01-01', assetId: 'a' } }
      })
    ).toEqual(['a.categoryId: 关联记录不存在']);
  });

  it('记录的实体或字段不在清单里时拒绝检查', () => {
    expect(() => checkRecords(assetSchema, { x: { entity: 'Project', fields: {} } })).toThrow('实体不受支持');
    expect(() => checkRecords(assetSchema, { x: { entity: 'Asset', fields: { price: 1 } } })).toThrow('字段不受支持');
  });
});

describe('非资产清单（项目 / 里程碑 / 标签）的检查', () => {
  const valid: Records = {
    p1: { entity: 'Project', fields: { title: 'Alpha', code: 'A', budget: 10, stage: 'plan' } },
    t1: { entity: 'Tag', fields: { label: 'urgent' } },
    m1: { entity: 'Milestone', fields: { name: 'Kickoff', dueOn: '2026-03-01', projectId: 'p1', tagId: 't1' } },
    m2: { entity: 'Milestone', fields: { name: 'Kickoff', dueOn: '2026-03-02', projectId: 'p1', tagId: null } }
  };

  it('合法数据没有检查结果：里程碑名可以重复，可空的标签关联可以为空', () => {
    expect(checkRecords(planningSchema, valid)).toEqual([]);
  });

  it('必填、唯一（标题与非标题字段）、必选与可空关联、枚举、整数、上下界、步长与布尔都由清单驱动', () => {
    expect(
      describeChecks(planningSchema, {
        ...valid,
        p2: { entity: 'Project', fields: { title: 'Alpha', code: 'A', budget: -5, stage: 'late' } },
        p3: { entity: 'Project', fields: { code: 'B', budget: 2000000 } },
        t2: { entity: 'Tag', fields: { label: 'urgent', color: false } },
        m3: { entity: 'Milestone', fields: { name: 'M3', weight: 2.5, dueOn: 'soon', projectId: 'p9', done: 'yes' } },
        m4: { entity: 'Milestone', fields: { name: 'M4', weight: 0, dueOn: '2026-01-01', tagId: 'p1' } },
        m5: { entity: 'Milestone', fields: { name: 'M5', weight: 11, dueOn: '2026-01-01', projectId: 'p1' } }
      })
    ).toEqual([
      'm3.projectId: 关联记录不存在',
      'm3.weight: 必须为整数',
      'm3.dueOn: 日期无效',
      'm3.done: 必须为布尔值',
      'm4.projectId: 关联记录不存在',
      'm4.tagId: 关联记录不存在',
      'm4.weight: 数值小于允许的最小值',
      'm5.weight: 数值大于允许的最大值',
      'p2.title: 名称必须唯一',
      'p2.code: 取值必须唯一',
      'p2.budget: 必须为非负数',
      'p2.stage: 取值不在允许范围内',
      'p3.title: 必填文本不能为空',
      'p3.budget: 数值大于允许的最大值',
      't2.label: 名称必须唯一',
      't2.color: 必须为文本'
    ]);
  });
});

describe('规则到词条的映射', () => {
  const rules: CheckRule[] = [
    'date',
    'email',
    'enum',
    'integer',
    'json',
    'number',
    'numberArray',
    'phone',
    'range',
    'required',
    'stringArray',
    'type',
    'url',
    'urlScheme',
    'uuid',
    'unique',
    'relation'
  ] satisfies (FieldValidationRule | 'unique' | 'relation')[];
  it('每条规则都映射到中英词条都有的协作文案，平台的中文固定文案不会直接显示', () => {
    const model = schemaModel(planningSchema);
    const entity = model.entity('Project')!;
    const messages = new Set<string>();
    for (const field of entity.fields)
      for (const rule of rules) {
        const value = rule === 'range' ? -1 : 'x';
        if (rule === 'range' && field.name !== 'budget') continue;
        messages.add(checkMessage(rule, field, entity, value));
      }
    for (const message of messages) expect(Object.hasOwn(collaborationEnglish, message), message).toBe(true);
    expect([...messages].some(message => message.includes(' 是必填项') || message.includes('必须是'))).toBe(false);
  });
});

/** 随机的项目数据：小名称池（容易重名）、随机悬空的外键、偶尔不合法的取值。 */
function randomRecords(next: () => number, count: number): Records {
  const records: Records = {};
  const ids = Array.from({ length: count }, (_, index) => `r${index}`);
  for (const id of ids) {
    const kind = pick(next, 3);
    const other = () => (next() < 0.8 ? choose(next, ids) : `gone${pick(next, 3)}`);
    if (kind === 0)
      records[id] = {
        entity: 'Project',
        fields: { title: `P${pick(next, 6)}`, code: next() < 0.5 ? `C${pick(next, 4)}` : null }
      };
    else if (kind === 1) records[id] = { entity: 'Tag', fields: { label: `T${pick(next, 5)}` } };
    else
      records[id] = {
        entity: 'Milestone',
        fields: {
          name: `M${pick(next, 3)}`,
          dueOn: '2026-04-01',
          projectId: other(),
          tagId: next() < 0.5 ? other() : null,
          weight: pick(next, 12)
        }
      };
  }
  return records;
}

/**
 * 按定向检查的约定从完整的 T 与合并结果造出 MergeView：只给改动记录、与它们共用唯一键的记录、
 * 引用了它们的记录，以及这些记录指向的记录。T 本身必须通过检查（与生产里的不变量一致）。
 */
function viewOf(target: Records, merged: Records, touched: string[]): MergeView {
  const touchedSet = new Set(touched);
  const mergedTouched = Object.fromEntries(touched.flatMap(id => (rowAt(merged, id) ? [[id, merged[id]]] : [])));
  const holders: Record<string, string[]> = {};
  for (const [id, row] of Object.entries(target))
    for (const key of recordKeys(planningSchema, row))
      if (key.kind === 'unique') (holders[recordKeyText(key)] ??= []).push(id);
  const suspects = Object.keys(target).filter(id => {
    if (touchedSet.has(id)) return false;
    const keys = recordKeys(planningSchema, target[id]);
    return keys.some(key => (key.kind === 'reference' ? touchedSet.has(key.value) : true));
  });
  const unchanged = Object.keys(target).filter(id => !touchedSet.has(id));
  const related = Object.fromEntries(unchanged.map(id => [id, target[id]]));
  // 改动记录指向的记录都要查过（T 里不存在的也登记为查过），与仓储的预读一致
  const targets = Object.values(mergedTouched).flatMap(row =>
    recordKeys(planningSchema, row).flatMap(key => (key.kind === 'reference' ? [key.value] : []))
  );
  return {
    touched,
    merged: mergedTouched,
    related,
    known: [...new Set([...unchanged, ...targets.filter(id => !touchedSet.has(id))])],
    suspects,
    holders
  };
}

describe('定向检查与整份检查一致', () => {
  it('随机改动 T 的一部分记录，只检查改动与受牵连的记录得到与整份检查相同的结果', () => {
    let compared = 0;
    let withIssues = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const next = seeded(seed);
      const target = randomRecords(next, 8 + pick(next, 8));
      // T 必须通过检查：去掉有问题的记录直到干净
      for (let round = 0; round < 20 && checkRecords(planningSchema, target).length; round++)
        for (const check of checkRecords(planningSchema, target)) delete target[check.recordId];
      if (checkRecords(planningSchema, target).length) continue;
      const merged = structuredClone(target);
      const extra = randomRecords(next, 4);
      const touched: string[] = [];
      for (const id of Object.keys(target).filter(() => next() < 0.3)) {
        touched.push(id);
        if (next() < 0.4) delete merged[id];
        else merged[id] = extra[choose(next, Object.keys(extra))];
      }
      for (const [index, row] of Object.values(extra).entries())
        if (next() < 0.5) {
          touched.push(`n${index}`);
          merged[`n${index}`] = row;
        }
      const full = checkRecords(planningSchema, merged);
      const view = viewOf(target, merged, touched);
      const holders: Record<string, readonly string[]> = { ...view.holders };
      for (const row of Object.values(view.merged))
        for (const key of recordKeys(planningSchema, row))
          if (key.kind === 'unique') holders[recordKeyText(key)] ??= [];
      expect(checkMerged(planningSchema, { ...view, holders }), `seed ${seed}`).toEqual(full);
      compared++;
      if (full.length) withIssues++;
    }
    expect(compared).toBeGreaterThan(200);
    expect(withIssues).toBeGreaterThan(50);
  });

  it('用到没有预读的唯一键或记录时按内部错误处理，不当作没有冲突', () => {
    const target: Records = { p1: { entity: 'Project', fields: { title: 'Alpha' } } };
    const merged: Records = {
      m1: { entity: 'Milestone', fields: { name: 'M', dueOn: '2026-01-01', projectId: 'p1' } }
    };
    const base: MergeView = { touched: ['m1'], merged, related: target, known: ['p1'], suspects: [], holders: {} };
    expect(checkMerged(planningSchema, base)).toEqual([]);
    expect(() => checkMerged(planningSchema, { ...base, known: [] })).toThrow(/not preloaded/);
    const project: Records = { p2: { entity: 'Project', fields: { title: 'Alpha' } } };
    expect(() => checkMerged(planningSchema, { ...base, touched: ['p2'], merged: project })).toThrow(/not preloaded/);
    expect(isMissing('  ')).toBe(true);
  });
});
