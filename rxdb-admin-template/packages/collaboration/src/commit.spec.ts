import {
  checkCommitExchangeBatch,
  computeCommitExchangeRecordFingerprint,
  parseCommitExchangeRecord
} from '@aiao/rxdb-plugin-working-tree/exchange';
import { describe, expect, it } from 'vitest';
import { parseCommits, uuidv7, verifyFingerprints, withFingerprint } from './commit.js';
import { taskCommit, testCreatedAt } from './commit.testing.js';
import { CollaborationError, type Commit } from './model.js';
import { diffAssets } from './schema.testing.js';

const root = '0193c4e0-0000-7000-8000-000000000001';
const changes = diffAssets({}, { c: { entity: 'AssetCategory', fields: { name: 'Computers' } } });
const first = taskCommit({ id: 'commit-1', parent: root, authorId: 'alice', message: 'First', changes });
const second = taskCommit({
  id: 'commit-2',
  parent: 'commit-1',
  authorId: 'alice',
  message: 'Second',
  changes: diffAssets(
    { c: { entity: 'AssetCategory', fields: { name: 'Computers' } } },
    { c: { entity: 'AssetCategory', fields: { name: 'Laptops' } } }
  )
});
/** 经一次 JSON 往返的线上形态：服务端收到的就是 `request.json()` 的结果。 */
const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const failure = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('expected a failure');
};
const rejected = (input: unknown) => failure(() => parseCommits(input));

describe('线上格式：上传的一批交换记录（严格解析与批次形状）', () => {
  it('收下合规的一批：每个记录原样交回，不改写任何字段', () => {
    const parsed = parseCommits(wire([first, second]));
    expect(parsed).toEqual([first, second]);
  });
  it('JSON 形状不合格按 invalid 拒绝，details 带平台的问题枚举、位置与提交 ID，不带内容', () => {
    const cases: [unknown, Record<string, unknown>][] = [
      // 旧协议的字段：多出来的字段是协议漂移的信号
      [[{ ...first, fingerprint: first.contentFingerprint }], { problem: 'unknown_field', path: '$.fingerprint' }],
      [[{ ...first, units: [{ ...first.units[0], sequence: 0 }] }], { problem: 'unknown_field' }],
      [
        [Object.fromEntries(Object.entries(first).filter(([key]) => key !== 'authorId'))],
        { problem: 'missing_field', path: '$.authorId' }
      ],
      [[{ ...first, createdAt: '2026-11-18' }], { problem: 'invalid_created_at' }],
      [[{ ...first, kind: 'squash' }], { problem: 'invalid_field', path: '$.kind' }],
      [['commit'], { problem: 'not_object', commitId: null }]
    ];
    for (const [input, details] of cases) {
      const error = rejected(wire(input));
      expect(error, JSON.stringify(details)).toBeInstanceOf(CollaborationError);
      expect(error).toMatchObject({ code: 'invalid', message: '请求字段不合法', details });
      expect(JSON.stringify((error as CollaborationError).details)).not.toContain('Computers');
    }
  });
  it('批次形状按平台的 checkCommitExchangeBatch 判（与 importCommits 判 invalid_batch 同一个函数），问题枚举映射到现有词条', () => {
    const orphan = taskCommit({ id: 'commit-3', parent: 'commit-9', authorId: 'alice', message: 'Third', changes });
    const cases: [Commit[], string, string][] = [
      [[], 'empty_batch', '一次同步需要 1～100 个提交'],
      [[second, first], 'not_topological', '提交父链不连续'],
      [[first, orphan], 'unreachable_from_head', '提交父链不连续'],
      [[{ ...first, parentIds: [root, root] }], 'invalid_parents', '提交父链不连续'],
      [[first, first], 'duplicate_commit', '请求字段不合法'],
      [[{ ...first, message: '  ' }], 'invalid_message', '请求字段不合法'],
      [[{ ...first, authorId: null }], 'invalid_author', '请求字段不合法'],
      [[{ ...first, units: [] }], 'invalid_units', '请求字段不合法'],
      [[{ ...first, units: [{ ...first.units[0], inversePatch: { name: 'x' } }] }], 'invalid_unit', '变更格式错误'],
      [[{ ...first, units: [{ ...first.units[0], transactionId: 'not-a-uuid' }] }], 'invalid_unit', '变更格式错误']
    ];
    for (const [input, problem, message] of cases) {
      const error = rejected(wire(input));
      expect(error, problem).toMatchObject({ code: 'invalid', message, details: { problem } });
      // 判同一份形状：平台函数对同一批（还原 createdAt 之后）给出同一个问题
      const records = (wire(input) as unknown[]).map(record => ({
        ...(record as Commit),
        createdAt: new Date(testCreatedAt)
      }));
      expect(checkCommitExchangeBatch(records as never)?.problem).toBe(problem);
    }
  });
  it('协作自己的规则：标识字符集、内容指纹的写法、四位年份、单元的实体与字段、取值只能是标量', () => {
    const unit = first.units[0];
    const cases: [unknown, string, string][] = [
      [{ ...first, commitId: 'commit 1' }, 'invalid', '请求字段不合法'],
      [{ ...first, parentIds: ['../root'] }, 'invalid', '请求字段不合法'],
      [{ ...first, authorId: 'alice@example' }, 'invalid', '请求字段不合法'],
      [{ ...first, contentFingerprint: 'not-a-digest' }, 'invalid', '请求字段不合法'],
      [{ ...first, createdAt: '+010000-01-01T00:00:00.000Z' }, 'invalid', '请求字段不合法'],
      [{ ...first, units: [{ ...unit, unitId: 'unit 1' }] }, 'invalid', '变更格式错误'],
      [{ ...first, units: [{ ...unit, entity: 'Asset Category' }] }, 'invalid', '实体不受支持'],
      [{ ...first, units: [{ ...unit, entityId: 'a/b' }] }, 'invalid', '记录标识格式错误'],
      [{ ...first, units: [{ ...unit, patch: { 'bad field': 1 } }] }, 'invalid', '字段不受支持'],
      [{ ...first, units: [{ ...unit, patch: { name: { nested: true } } }] }, 'invalid', '字段值格式错误'],
      [{ ...first, units: [{ ...unit, patch: { name: ['a'] } }] }, 'invalid', '字段值格式错误'],
      // jsonb 存不下 U+0000：收下它，写库时才失败
      [{ ...first, units: [{ ...unit, patch: { name: 'a\u0000b' } }] }, 'invalid', '字段值格式错误'],
      [{ ...first, units: [{ ...unit, patch: { name: 'x'.repeat(10001) } }] }, 'limit', '字段内容过长']
    ];
    for (const [record, code, message] of cases) {
      const error = rejected(wire([record]));
      expect(error, JSON.stringify(record).slice(0, 80)).toMatchObject({ code, message });
    }
    expect(rejected(wire(Array.from({ length: 101 }, () => first)))).toMatchObject({
      code: 'invalid',
      message: '一次同步需要 1～100 个提交'
    });
    expect(rejected({ commits: [] })).toMatchObject({ code: 'invalid', message: '请求字段不合法' });
  });
});

describe('内容指纹：平台的 computeCommitExchangeRecordFingerprint', () => {
  it('与插件文档的示例哈希逐字相同（服务端与客户端不另写一份规范化）', () => {
    const example: Commit = withFingerprint({
      commitId: 'c1',
      parentIds: ['p1'],
      kind: 'normal',
      message: '新建任务',
      authorId: 'alice',
      createdAt: testCreatedAt,
      units: [
        {
          unitId: 'u1',
          transactionId: null,
          namespace: 'public',
          entity: 'Task',
          entityId: 't1',
          operation: 'insert',
          patch: { title: '草稿', done: false, n: 1.5 },
          inversePatch: null,
          origin: 'local'
        }
      ]
    });
    expect(example.contentFingerprint).toBe('b70f7d4cd7d8bf73ee6853947958f79dedf7501be7c6b152777239710bd4bf54');
    expect(example.contentFingerprint).toBe(computeCommitExchangeRecordFingerprint(example));
  });
  it('收下声明与内容一致的提交；种类、父、消息、作者、单元任一处被改都以 invalid 拒绝，details 指出提交', () => {
    expect(() => verifyFingerprints([first, second])).not.toThrow();
    const forged: Commit[] = [
      { ...second, message: 'Tampered' },
      { ...second, authorId: 'mallory' },
      { ...second, parentIds: [root] },
      { ...second, kind: 'merge' },
      { ...second, units: [{ ...second.units[0], patch: { name: 'Desktops' } }] },
      { ...second, units: [{ ...second.units[0], origin: 'remote_sync' }] },
      { ...second, contentFingerprint: '0'.repeat(64) }
    ];
    for (const commit of forged)
      expect(failure(() => verifyFingerprints([first, commit]))).toMatchObject({
        code: 'invalid',
        message: '提交指纹与内容不一致',
        details: { commitId: 'commit-2' }
      });
  });
  it('提交 ID 与时间不进指纹：换 ID、换时间，指纹不变', () => {
    expect(withFingerprint({ ...first, commitId: 'other', createdAt: '2030-01-01T00:00:00.000Z' })).toMatchObject({
      contentFingerprint: first.contentFingerprint
    });
  });
  it('线上的记录过一遍平台的严格解析仍是同一份内容', () => {
    const record = parseCommitExchangeRecord(wire(first));
    expect(record.createdAt).toEqual(new Date(testCreatedAt));
    expect(computeCommitExchangeRecordFingerprint(record)).toBe(first.contentFingerprint);
  });
});

describe('commit ids', () => {
  const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  it('are UUIDv7: version 7, RFC variant, and the first 48 bits are the millisecond timestamp', () => {
    const at = Date.UTC(2026, 10, 17, 8, 30, 15, 123);
    const id = uuidv7(at);
    expect(id).toMatch(pattern);
    expect(Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16)).toBe(at);
  });
  it('are unique and sort by creation time', () => {
    const ids = Array.from({ length: 200 }, (_, index) => uuidv7(1_800_000_000_000 + index));
    expect(new Set(ids).size).toBe(200);
    expect([...ids].sort()).toEqual(ids);
    expect(uuidv7()).toMatch(pattern);
  });
});
