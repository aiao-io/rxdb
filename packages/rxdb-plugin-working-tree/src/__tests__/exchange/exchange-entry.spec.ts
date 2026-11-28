/**
 * @fileoverview US-319 补充交付：`@aiao/rxdb-plugin-working-tree/exchange` 子路径——交换的另一端照着用的那几个纯函数。
 *
 * @remarks
 * 首个使用方是 Admin 的服务端：校验上传批次的形状、复算单元指纹与提交指纹、给自己合成的合并提交算指纹，收发都走 JSON，
 * 还要能跑在 Supabase Edge Function（Deno）里。这里的函数**全部经子路径入口（`src/exchange.ts`）取**，不从实现模块直接拿：
 * 测的就是服务端实际 import 到的那一份。钉三件事：
 *
 * 1. **指纹**：插件文档「内容指纹的规范化规则」的两个示例哈希经入口复算逐字相同；按交换记录算指纹时 `authorId` 进的是
 *    `author` 那一格、消息原样不 trim——这条字段对应写死在入口里，服务端不必（也不该）自己再拼一遍。
 * 2. **批次形状**：每一种被拒的形状都报出 `importCommits()` 的 `invalid_batch` 那一个 `problem`。两边是同一个函数，
 *    逐例对拍在 `import-commits.spec.ts` 的「批次形状」一节；这里补的是服务端最容易踩的那几种（没先解析 JSON 就判形状）。
 * 3. **JSON 编解码**：往返不变；`createdAt` 只收 `toISOString()` 写得出的那一种；缺字段、多字段、类型或取值不对、补丁里有
 *    JSON 表示不了的值，一律抛 {@link CommitExchangeJsonError}，不静默修正；错误只带枚举、位置与提交 id，不带内容（FR-043）。
 *
 * 只导入 `./exchange` 时不加载实体类、插件类与捕获运行时，由 `exchange-entry-isolation.spec.ts` 在一个干净的模块环境里证。
 */

import { describe, expect, it } from 'vitest';
import {
  checkCommitExchangeBatch,
  CommitExchangeJsonError,
  computeChangeUnitFingerprint,
  computeCommitContentFingerprint,
  computeCommitExchangeRecordFingerprint,
  parseCommitExchangeRecord,
  serializeCommitExchangeRecord,
  type CommitChangeUnitContent,
  type CommitExchangeJsonProblem,
  type CommitExchangeRecord,
  type CommitExchangeRecordJson,
  type CommitImportBatchProblem,
  type CommitKind
} from '../../exchange.js';

/** 文档示例里那一个单元。 */
const DOC_UNIT: CommitChangeUnitContent = {
  unitId: 'u1',
  transactionId: null,
  namespace: 'public',
  entity: 'Task',
  entityId: 't1',
  operation: 'insert',
  patch: { title: '草稿', done: false, n: 1.5 },
  inversePatch: null,
  origin: 'local'
};

/** 文档里写着的单元指纹。 */
const DOC_UNIT_FINGERPRINT = '613a8d5cca23db9957f32007b498b1f864ef8d840fd14e0d5e60f95e4a5132a2';

/** 文档里写着的提交指纹：含 {@link DOC_UNIT}、`normal`、父 `p1`、消息「新建任务」、作者 `alice`。 */
const DOC_COMMIT_FINGERPRINT = 'b70f7d4cd7d8bf73ee6853947958f79dedf7501be7c6b152777239710bd4bf54';

/** 提交 id：UUIDv7 形状，与首个使用方一致。 */
const LOCAL_HEAD = '01937000-0000-7000-8000-000000000001';
const A = '01937000-0000-7000-8000-0000000000a1';
const B = '01937000-0000-7000-8000-0000000000a2';
const SIDE = '01937000-0000-7000-8000-0000000000b1';
const MERGE = '01937000-0000-7000-8000-0000000000c1';
const ROOT = '01937000-0000-7000-8000-0000000000f0';

/** 一笔事务的 id；单元的 `transactionId` 是 uuid 列。 */
const TX = '01937000-0000-7000-8000-0000000000d1';

/** 远端那一份时间，带毫秒：`toISOString()` 恒带三位毫秒。 */
const CREATED_AT = new Date('2026-11-18T03:04:05.678Z');

/** 一个落库形态的单元；默认是一行插入。 */
const unitOf = (overrides: Partial<CommitChangeUnitContent> = {}): CommitChangeUnitContent => ({
  ...DOC_UNIT,
  unitId: 'unit-t1',
  entityId: 't1',
  ...overrides
});

/** 一条记录的可拨字段；没给的按种类补，指纹按内容现算。 */
interface RecordSeed {
  readonly commitId: string;
  readonly parentIds: readonly string[];
  readonly kind?: CommitKind;
  readonly message?: string;
  readonly authorId?: string | null;
  readonly units?: readonly CommitChangeUnitContent[];
}

/** 造一条自洽的交换记录：指纹由入口的同一个函数算。 */
const recordOf = (seed: RecordSeed): CommitExchangeRecord => {
  const kind = seed.kind ?? (seed.parentIds.length > 1 ? 'merge' : 'normal');
  const system = kind === 'baseline' || kind === 'branch_baseline';
  const content = {
    kind,
    parentIds: seed.parentIds,
    message: seed.message ?? (system ? '基线' : '服务端提交'),
    authorId: seed.authorId === undefined && !system ? 'server-alice' : (seed.authorId ?? null),
    units: seed.units ?? (system || kind === 'merge' ? [] : [unitOf()])
  };
  return {
    commitId: seed.commitId,
    createdAt: CREATED_AT,
    contentFingerprint: computeCommitExchangeRecordFingerprint(content),
    ...content
  };
};

/** 一个 JSON 值（`JSON.stringify` 之后再 `JSON.parse`）：网络那一头交过来的就是这种东西。 */
const overTheWire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

/** 一条把 JSON 形态各处都用上的记录：三种操作、事务 id、远端来源、嵌套的 JSON 值、编码列的包装、表情。 */
const RICH: CommitExchangeRecord = recordOf({
  commitId: A,
  parentIds: [LOCAL_HEAD],
  message: '  消息原样保存，不 trim  ',
  units: [
    unitOf({
      transactionId: TX,
      patch: { title: '🙂 新任务', tags: ['a', 'b'], meta: { depth: { deeper: [1, 2.5, -3] } } }
    }),
    unitOf({
      unitId: 'unit-t2',
      entityId: 't2',
      operation: 'update',
      transactionId: TX,
      patch: { done: true, size: { $rxdbChangeValue: { type: 'bigint', value: '9007199254740993' } } },
      inversePatch: { done: false, size: null }
    }),
    unitOf({
      unitId: 'unit-t3',
      entityId: 't3',
      operation: 'delete',
      patch: null,
      inversePatch: { title: '删掉的那一行', done: false },
      origin: 'remote_sync'
    })
  ]
});

/** `run` 抛出的东西；没抛就让用例失败。 */
const thrownBy = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('期望抛错，实际没有抛');
};

/** 抛出的 {@link CommitExchangeJsonError} 的三个诊断位；抛了别的就原样抛出去。 */
const rejectionOf = (run: () => unknown): Pick<CommitExchangeJsonError, 'problem' | 'path' | 'commitId'> => {
  const error = thrownBy(run);
  if (!(error instanceof CommitExchangeJsonError)) throw error;
  return { problem: error.problem, path: error.path, commitId: error.commitId };
};

/** 一份合格的 JSON 记录，交给各条用例去改坏。 */
const wireRecord = (): Record<string, unknown> =>
  overTheWire(serializeCommitExchangeRecord(RICH)) as Record<string, unknown>;

/** 改坏 {@link wireRecord} 的第一个单元。 */
const withFirstUnit = (change: (unit: Record<string, unknown>) => void): Record<string, unknown> => {
  const json = wireRecord();
  change((json['units'] as Record<string, unknown>[])[0]);
  return json;
};

describe('指纹：经子路径入口复算', () => {
  it('文档示例：单元指纹 613a8d5c… 与提交指纹 b70f7d4c… 逐字相同', () => {
    expect(computeChangeUnitFingerprint(DOC_UNIT)).toBe(DOC_UNIT_FINGERPRINT);
    expect(
      computeCommitContentFingerprint({
        kind: 'normal',
        parentIds: ['p1'],
        message: '新建任务',
        author: 'alice',
        units: [DOC_UNIT]
      })
    ).toBe(DOC_COMMIT_FINGERPRINT);
  });

  it('按交换记录算：authorId 进 author 那一格，与文档示例逐字相同', () => {
    expect(
      computeCommitExchangeRecordFingerprint({
        kind: 'normal',
        parentIds: ['p1'],
        message: '新建任务',
        authorId: 'alice',
        units: [DOC_UNIT]
      })
    ).toBe(DOC_COMMIT_FINGERPRINT);
  });

  it('按交换记录算：消息原样进指纹，trim 过的是另一个指纹', () => {
    const trimmed = { ...RICH, message: RICH.message.trim() };

    expect(computeCommitExchangeRecordFingerprint(RICH)).toBe(RICH.contentFingerprint);
    expect(computeCommitExchangeRecordFingerprint(trimmed)).not.toBe(RICH.contentFingerprint);
  });

  it('服务端收到的 JSON：解析之后按记录复算的指纹就是文档那一个，批次形状也合格', () => {
    const received = overTheWire({
      commitId: A,
      parentIds: ['p1'],
      kind: 'normal',
      message: '新建任务',
      authorId: 'alice',
      createdAt: '2026-11-18T03:04:05.678Z',
      contentFingerprint: DOC_COMMIT_FINGERPRINT,
      units: [DOC_UNIT]
    });

    const record = parseCommitExchangeRecord(received);

    expect(computeCommitExchangeRecordFingerprint(record)).toBe(record.contentFingerprint);
    expect(checkCommitExchangeBatch([record])).toBeUndefined();
  });
});

describe('批次形状：checkCommitExchangeBatch', () => {
  it('合格的批次（侧枝、合并、只记祖先关系的空合并）没有毛病', () => {
    const batch = [
      recordOf({ commitId: A, parentIds: [LOCAL_HEAD] }),
      recordOf({ commitId: SIDE, parentIds: [LOCAL_HEAD] }),
      recordOf({ commitId: MERGE, parentIds: [A, SIDE] })
    ];

    expect(checkCommitExchangeBatch(batch)).toBeUndefined();
  });

  it.each<CommitKind>(['baseline', 'branch_baseline'])('从空分支开始的整条链：系统根节点（%s）打头', kind => {
    const batch = [recordOf({ commitId: ROOT, parentIds: [], kind }), recordOf({ commitId: A, parentIds: [ROOT] })];

    expect(checkCommitExchangeBatch(batch)).toBeUndefined();
  });

  const valid = (): CommitExchangeRecord => recordOf({ commitId: A, parentIds: [LOCAL_HEAD] });
  const normalWith = (units: readonly CommitChangeUnitContent[]): CommitExchangeRecord =>
    recordOf({ commitId: A, parentIds: [LOCAL_HEAD], units });

  it.each<readonly [CommitImportBatchProblem, string, () => readonly unknown[], string | null]>([
    ['empty_batch', '一个提交都没有', () => [], null],
    ['invalid_commit_id', '记录不是对象', () => [null], null],
    ['invalid_commit_id', 'commitId 是空串', () => [{ ...valid(), commitId: '' }], null],
    ['duplicate_commit', '同一个 id 两次', () => [valid(), valid()], A],
    ['invalid_kind', '不认识的种类', () => [{ ...valid(), kind: 'squash' }], A],
    [
      'invalid_parents',
      '普通提交两个父',
      () => [recordOf({ commitId: A, parentIds: [LOCAL_HEAD, ROOT], kind: 'normal' })],
      A
    ],
    [
      'invalid_parents',
      '合并提交一个父',
      () => [recordOf({ commitId: MERGE, parentIds: [LOCAL_HEAD], kind: 'merge' })],
      MERGE
    ],
    ['invalid_parents', '父重复', () => [recordOf({ commitId: MERGE, parentIds: [A, A], kind: 'merge' })], MERGE],
    ['invalid_parents', '父是自己', () => [recordOf({ commitId: A, parentIds: [A] })], A],
    ['invalid_parents', '系统根节点带父', () => [recordOf({ commitId: ROOT, parentIds: [A], kind: 'baseline' })], ROOT],
    [
      'invalid_parents',
      '分支基线带父',
      () => [recordOf({ commitId: ROOT, parentIds: [A], kind: 'branch_baseline' })],
      ROOT
    ],
    ['invalid_parents', '父 id 不是字符串', () => [{ ...valid(), parentIds: [42] }], A],
    ['invalid_message', '消息只有空白', () => [recordOf({ commitId: A, parentIds: [LOCAL_HEAD], message: ' \n ' })], A],
    ['invalid_author', '普通提交缺作者', () => [recordOf({ commitId: A, parentIds: [LOCAL_HEAD], authorId: null })], A],
    [
      'invalid_author',
      '系统根节点带作者',
      () => [recordOf({ commitId: ROOT, parentIds: [], kind: 'baseline', authorId: 'mallory' })],
      ROOT
    ],
    // 服务端最容易踩的一种：拿 `request.json()` 的结果直接判形状，没先 `parseCommitExchangeRecord()`——JSON 里的 createdAt 是串
    ['invalid_created_at', '没先解析 JSON，createdAt 还是串', () => [overTheWire(valid())], A],
    ['invalid_units', '普通提交没有单元', () => [normalWith([])], A],
    [
      'invalid_units',
      '系统根节点带单元',
      () => [recordOf({ commitId: ROOT, parentIds: [], kind: 'baseline', units: [unitOf()] })],
      ROOT
    ],
    ['invalid_unit', 'transactionId 不是 uuid', () => [normalWith([unitOf({ transactionId: 'tx-1' })])], A],
    ['invalid_unit', 'entityId 只有空白', () => [normalWith([unitOf({ entityId: ' ' })])], A],
    ['invalid_unit', '修改缺反向补丁', () => [normalWith([unitOf({ operation: 'update' })])], A],
    ['invalid_unit', '插入带了反向补丁', () => [normalWith([unitOf({ inversePatch: { title: '旧' } })])], A],
    ['invalid_unit', '删除带了正向补丁', () => [normalWith([unitOf({ operation: 'delete' })])], A],
    ['invalid_unit', '不认识的来源', () => [{ ...valid(), units: [{ ...unitOf(), origin: 'server' }] }], A],
    [
      'not_topological',
      '子排在父前面',
      () => [recordOf({ commitId: B, parentIds: [A] }), recordOf({ commitId: A, parentIds: [LOCAL_HEAD] })],
      B
    ],
    [
      'unreachable_from_head',
      '挂在新头之外的提交',
      () => [recordOf({ commitId: SIDE, parentIds: [LOCAL_HEAD] }), recordOf({ commitId: A, parentIds: [LOCAL_HEAD] })],
      SIDE
    ]
  ])('%s：%s', (problem, _label, build, commitId) => {
    expect(checkCommitExchangeBatch(build() as readonly CommitExchangeRecord[])).toEqual({ problem, commitId });
  });
});

describe('JSON 编解码：serializeCommitExchangeRecord / parseCommitExchangeRecord', () => {
  it('序列化 → JSON 文本 → 解析，与原记录相等，指纹照样复算得上', () => {
    const parsed = parseCommitExchangeRecord(JSON.parse(JSON.stringify(serializeCommitExchangeRecord(RICH))));

    expect(parsed).toStrictEqual(RICH);
    expect(computeCommitExchangeRecordFingerprint(parsed)).toBe(RICH.contentFingerprint);
  });

  it('序列化的产物就是 JSON 值：createdAt 是 toISOString() 的串，其余字段原样', () => {
    const json: CommitExchangeRecordJson = serializeCommitExchangeRecord(RICH);

    expect(json).toStrictEqual({ ...RICH, createdAt: '2026-11-18T03:04:05.678Z' });
    expect(overTheWire(json)).toStrictEqual(json);
  });

  it('序列化逐字段挑：单元上不属于交换格式的字段（捕获期的 baseFingerprint / fingerprint）不上线', () => {
    const captured = { ...DOC_UNIT, baseFingerprint: null, fingerprint: DOC_UNIT_FINGERPRINT };

    const json = serializeCommitExchangeRecord({ ...RICH, units: [captured] });

    expect(json.units).toStrictEqual([DOC_UNIT]);
  });

  it('同一份 JSON 解析两次得到两份互不相干的记录：数组与 Date 都是新造的', () => {
    const json = wireRecord();

    const first = parseCommitExchangeRecord(json);
    const second = parseCommitExchangeRecord(json);

    expect(first).toStrictEqual(second);
    expect(first.createdAt).not.toBe(second.createdAt);
    expect(first.parentIds).not.toBe(json['parentIds']);
    expect(first.units).not.toBe(json['units']);
  });

  it.each<readonly [string, unknown]>([
    ['只有日期', '2026-11-18'],
    ['没有毫秒', '2026-11-18T03:04:05Z'],
    ['带时区偏移', '2026-11-18T11:04:05.678+08:00'],
    ['小写的 z', '2026-11-18T03:04:05.678z'],
    ['Date 构造器认得的别的写法', 'Tue Nov 18 2026 03:04:05 GMT+0000'],
    // `new Date()` 把它静默挪到 3 月 2 日：宽松地收下就是把时间改了
    ['不存在的日子', '2026-02-30T00:00:00.000Z'],
    ['空串', ''],
    ['毫秒数', CREATED_AT.getTime()],
    ['null', null]
  ])('createdAt 只收 toISOString() 的写法：%s 被拒', (_label, createdAt) => {
    expect(rejectionOf(() => parseCommitExchangeRecord({ ...wireRecord(), createdAt }))).toEqual({
      problem: 'invalid_created_at',
      path: '$.createdAt',
      commitId: A
    });
  });

  it('createdAt 落在四位年份之外照样往返：toISOString() 写得出来的都收', () => {
    const far = { ...RICH, createdAt: new Date('+275760-09-13T00:00:00.000Z') };

    expect(parseCommitExchangeRecord(overTheWire(serializeCommitExchangeRecord(far)))).toStrictEqual(far);
  });

  it.each<readonly [CommitExchangeJsonProblem, string, () => unknown]>([
    // 值为 undefined 的键过一遍 JSON 就没了，与键不存在是同一件事
    ['missing_field', '$.createdAt', () => ({ ...wireRecord(), createdAt: undefined })],
    [
      'missing_field',
      '$.authorId',
      () => Object.fromEntries(Object.entries(wireRecord()).filter(([key]) => key !== 'authorId'))
    ],
    [
      'missing_field',
      '$.units[0].origin',
      () =>
        withFirstUnit(unit => {
          delete unit['origin'];
        })
    ],
    ['unknown_field', '$.operationId', () => ({ ...wireRecord(), operationId: TX })],
    ['unknown_field', '$.changeSetCount', () => ({ ...wireRecord(), changeSetCount: 3 })],
    [
      'unknown_field',
      '$.units[0].sequence',
      () =>
        withFirstUnit(unit => {
          unit['sequence'] = 0;
        })
    ],
    [
      'unknown_field',
      '$.units[0].fingerprint',
      () =>
        withFirstUnit(unit => {
          unit['fingerprint'] = DOC_UNIT_FINGERPRINT;
        })
    ],
    ['not_object', '$.units[0]', () => ({ ...wireRecord(), units: [null] })],
    ['not_object', '$.units[0]', () => ({ ...wireRecord(), units: [['unit']] })],
    ['invalid_field', '$.kind', () => ({ ...wireRecord(), kind: 'squash' })],
    ['invalid_field', '$.parentIds', () => ({ ...wireRecord(), parentIds: LOCAL_HEAD })],
    ['invalid_field', '$.parentIds[1]', () => ({ ...wireRecord(), parentIds: [LOCAL_HEAD, 7] })],
    ['invalid_field', '$.message', () => ({ ...wireRecord(), message: null })],
    ['invalid_field', '$.authorId', () => ({ ...wireRecord(), authorId: 42 })],
    ['invalid_field', '$.contentFingerprint', () => ({ ...wireRecord(), contentFingerprint: null })],
    ['invalid_field', '$.units', () => ({ ...wireRecord(), units: {} })],
    [
      'invalid_field',
      '$.units[0].operation',
      () =>
        withFirstUnit(unit => {
          unit['operation'] = 'upsert';
        })
    ],
    [
      'invalid_field',
      '$.units[0].origin',
      () =>
        withFirstUnit(unit => {
          unit['origin'] = 'server';
        })
    ],
    [
      'invalid_field',
      '$.units[0].transactionId',
      () =>
        withFirstUnit(unit => {
          unit['transactionId'] = 7;
        })
    ],
    [
      'invalid_field',
      '$.units[0].patch',
      () =>
        withFirstUnit(unit => {
          unit['patch'] = ['title'];
        })
    ],
    [
      'invalid_field',
      '$.units[0].inversePatch',
      () =>
        withFirstUnit(unit => {
          unit['inversePatch'] = 'title';
        })
    ]
  ])('解析严格：%s（%s）', (problem, path, build) => {
    expect(rejectionOf(() => parseCommitExchangeRecord(overTheWire(build())))).toEqual({ problem, path, commitId: A });
  });

  it.each<readonly [string, unknown]>([
    ['null', null],
    ['数组', [RICH]],
    ['字符串', JSON.stringify(RICH)],
    ['数字', 1]
  ])('记录本身不是 JSON 对象（%s）：not_object，认不出 commitId', (_label, json) => {
    expect(rejectionOf(() => parseCommitExchangeRecord(json))).toEqual({
      problem: 'not_object',
      path: '$',
      commitId: null
    });
  });

  it('commitId 本身不是字符串：报 invalid_field，认不出 id 就不报 id', () => {
    expect(rejectionOf(() => parseCommitExchangeRecord({ ...wireRecord(), commitId: 7 }))).toEqual({
      problem: 'invalid_field',
      path: '$.commitId',
      commitId: null
    });
  });

  /** 一个类实例：原型不是 `Object.prototype`，JSON 表示不了它。 */
  class Point {
    constructor(readonly x: number) {}
  }

  /** 一个指着自己的对象。 */
  const cyclic = (): Record<string, unknown> => {
    const node: Record<string, unknown> = {};
    node['self'] = node;
    return node;
  };

  /** 下标 1 是空位的数组（`[1, , 3]`）。 */
  const holey = (): unknown[] => {
    const items: unknown[] = [1];
    items[2] = 3;
    return items;
  };

  it.each<readonly [string, unknown, string]>([
    ['undefined', undefined, '$.units[0].patch.value'],
    ['NaN', Number.NaN, '$.units[0].patch.value'],
    ['Infinity', Number.POSITIVE_INFINITY, '$.units[0].patch.value'],
    ['bigint', 10n, '$.units[0].patch.value'],
    ['函数', () => 1, '$.units[0].patch.value'],
    ['symbol', Symbol('x'), '$.units[0].patch.value'],
    ['Date', new Date(0), '$.units[0].patch.value'],
    ['Map', new Map([['a', 1]]), '$.units[0].patch.value'],
    ['字节数组', new Uint8Array([1, 2]), '$.units[0].patch.value'],
    ['类实例', new Point(1), '$.units[0].patch.value'],
    ['数组里的 undefined', [1, undefined], '$.units[0].patch.value[1]'],
    ['稀疏数组的空位', holey(), '$.units[0].patch.value[1]'],
    ['深处的 NaN', { a: [{ b: Number.NaN }] }, '$.units[0].patch.value.a[0].b'],
    ['循环引用', cyclic(), '$.units[0].patch.value.self']
  ])('补丁里有 JSON 表示不了的值（%s）：序列化与解析都拒，不交给 JSON.stringify 去改写', (_label, value, path) => {
    const units = [unitOf({ patch: { title: '标题', value } })];

    expect(rejectionOf(() => serializeCommitExchangeRecord({ ...RICH, units }))).toEqual({
      problem: 'not_json_value',
      path,
      commitId: A
    });
    expect(rejectionOf(() => parseCommitExchangeRecord({ ...wireRecord(), units }))).toEqual({
      problem: 'not_json_value',
      path,
      commitId: A
    });
  });

  it('同一个对象在补丁里出现两次不是循环引用', () => {
    const shared = { label: '共用' };
    const record = { ...RICH, units: [unitOf({ patch: { left: shared, right: shared } })] };

    expect(parseCommitExchangeRecord(serializeCommitExchangeRecord(record)).units[0].patch).toStrictEqual({
      left: { label: '共用' },
      right: { label: '共用' }
    });
  });

  it.each<readonly [string, unknown]>([
    ['无效的 Date', new Date(Number.NaN)],
    ['串', '2026-11-18T03:04:05.678Z'],
    ['毫秒数', CREATED_AT.getTime()]
  ])('序列化：createdAt 不是有效的 Date（%s）报 invalid_created_at', (_label, createdAt) => {
    const record = { ...RICH, createdAt } as unknown as CommitExchangeRecord;

    expect(rejectionOf(() => serializeCommitExchangeRecord(record))).toEqual({
      problem: 'invalid_created_at',
      path: '$.createdAt',
      commitId: A
    });
  });

  it('序列化也按收的那一端的规则判：交出去的东西对面一定收得下', () => {
    const record = { ...RICH, kind: 'squash' } as unknown as CommitExchangeRecord;

    expect(rejectionOf(() => serializeCommitExchangeRecord(record))).toEqual({
      problem: 'invalid_field',
      path: '$.kind',
      commitId: A
    });
  });

  it('序列化不替误传的类型圆场：parentIds 误传成串，不会被拆成一个个字符的数组', () => {
    const record = { ...RICH, parentIds: LOCAL_HEAD } as unknown as CommitExchangeRecord;

    expect(rejectionOf(() => serializeCommitExchangeRecord(record))).toEqual({
      problem: 'invalid_field',
      path: '$.parentIds',
      commitId: A
    });
  });

  it('错误只带枚举、位置与提交 id，消息、作者与补丁的值一个字都不带（FR-043）', () => {
    const secret = { ...wireRecord(), message: '机密的提交消息', authorId: '机密的作者', createdAt: '机密的时间' };

    const error = thrownBy(() => parseCommitExchangeRecord(secret));

    expect(error).toBeInstanceOf(CommitExchangeJsonError);
    const logged = JSON.stringify(error, Object.getOwnPropertyNames(error));
    expect(logged).not.toContain('机密');
    expect(logged).not.toContain('🙂');
    expect(logged).toContain(A);
  });
});
