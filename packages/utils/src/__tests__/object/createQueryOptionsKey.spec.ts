import { describe, expect, it } from 'vitest';
import { createQueryOptionsKey } from '../../object/createQueryOptionsKey.js';
import { createStableKey } from '../../object/createStableKey.js';

const LABEL = 'RxDB query options';

/** 模拟 RxDB 实体：原型不是 `Object.prototype`，正是 createStableKey 显式拒绝的形状。 */
class ProbeEntity {
  constructor(
    readonly id: string,
    readonly createdAt: Date,
    readonly title: string
  ) {}
}

/** 模拟 `packages/rxdb/src/entity/proxy.ts` 的包装：只有 set 陷阱，getPrototypeOf 透传。 */
const wrap = <T extends object>(entity: T): T =>
  new Proxy(entity, {
    set: (target, key, value) => Reflect.set(target, key, value)
  });

/** 不带游标的查询选项；单独拆出来是为了能按需拼 `after` 或 `before`。 */
const baseOptions = (): Record<string, unknown> => ({
  where: { combinator: 'and', rules: [] },
  orderBy: [
    { field: 'createdAt', sort: 'desc' },
    { field: 'id', sort: 'asc' }
  ],
  limit: 20
});

const cursorOptions = (after: unknown): Record<string, unknown> => ({ ...baseOptions(), after });

describe('createQueryOptionsKey', () => {
  // RVU-001 / RRE-002：这两条断言是本函数存在的全部理由 ——
  // 上面那条红了说明缺陷已被别处修掉，下面那条红了说明本函数退化。
  it('实体游标不再被当作非法宿主对象', () => {
    const options = cursorOptions(wrap(new ProbeEntity('c1', new Date('2026-01-01T00:00:00.000Z'), '甲')));

    expect(() => createStableKey(options, LABEL)).toThrow(TypeError);
    expect(typeof createQueryOptionsKey(options, LABEL)).toBe('string');
  });

  it('before 与 after 都投影，且两者不互相坍缩', () => {
    const entity = wrap(new ProbeEntity('c1', new Date('2026-01-01T00:00:00.000Z'), '甲'));
    const rest = baseOptions();

    expect(typeof createQueryOptionsKey({ ...rest, before: entity }, LABEL)).toBe('string');
    expect(createQueryOptionsKey({ ...rest, before: entity }, LABEL)).not.toBe(
      createQueryOptionsKey({ ...rest, after: entity }, LABEL)
    );
  });

  it('同 identity 的新实例产出同一个 key', () => {
    const at = new Date('2026-01-01T00:00:00.000Z');

    expect(createQueryOptionsKey(cursorOptions(new ProbeEntity('c1', at, '甲')), LABEL)).toBe(
      createQueryOptionsKey(cursorOptions(new ProbeEntity('c1', new Date(at), '甲')), LABEL)
    );
  });

  it('orderBy 字段值变化时 key 变化', () => {
    const first = new ProbeEntity('c1', new Date('2026-01-01T00:00:00.000Z'), '甲');

    expect(createQueryOptionsKey(cursorOptions(first), LABEL)).not.toBe(
      createQueryOptionsKey(cursorOptions(new ProbeEntity('c2', new Date('2026-01-01T00:00:00.000Z'), '甲')), LABEL)
    );
    expect(createQueryOptionsKey(cursorOptions(first), LABEL)).not.toBe(
      createQueryOptionsKey(cursorOptions(new ProbeEntity('c1', new Date('2026-07-01T00:00:00.000Z'), '甲')), LABEL)
    );
  });

  // 游标身份 = orderBy 字段取值。标题改了不代表游标挪了位置，
  // 若因此重订阅，活查询回填标题就会触发无限重查。
  it('非 orderBy 字段变化不构成新游标', () => {
    const at = new Date('2026-01-01T00:00:00.000Z');

    expect(createQueryOptionsKey(cursorOptions(new ProbeEntity('c1', at, '甲')), LABEL)).toBe(
      createQueryOptionsKey(cursorOptions(new ProbeEntity('c1', at, '乙')), LABEL)
    );
  });

  it('裸实体 / Proxy 实体 / plain 快照三者等价', () => {
    const entity = new ProbeEntity('c1', new Date('2026-01-01T00:00:00.000Z'), '甲');
    const expected = createQueryOptionsKey(cursorOptions(entity), LABEL);

    expect(createQueryOptionsKey(cursorOptions(wrap(entity)), LABEL)).toBe(expected);
    expect(createQueryOptionsKey(cursorOptions({ ...entity }), LABEL)).toBe(expected);
  });

  // orderBy 非法时由核心的 findByCursor 抛 RxDBError（'orderBy is required…'），
  // 算 key 这一步只需给出确定结果，不代核心做校验、也不提前炸掉组件树。
  it.each([
    ['缺省', undefined],
    ['空数组', []],
    ['非数组', 'createdAt']
  ])('orderBy %s 时退回主键 id', (_name, orderBy) => {
    const at = new Date('2026-01-01T00:00:00.000Z');
    const build = (title: string): Record<string, unknown> => ({
      where: {},
      orderBy,
      after: wrap(new ProbeEntity('c1', at, title))
    });

    expect(createQueryOptionsKey(build('甲'), LABEL)).toBe(createQueryOptionsKey(build('乙'), LABEL));
    expect(createQueryOptionsKey(build('甲'), LABEL)).not.toBe(
      createQueryOptionsKey({ where: {}, orderBy, after: wrap(new ProbeEntity('c2', at, '甲')) }, LABEL)
    );
  });

  it('orderBy 顺序不同即不同 key', () => {
    const entity = wrap(new ProbeEntity('c1', new Date('2026-01-01T00:00:00.000Z'), '甲'));
    const reversed = {
      ...cursorOptions(entity),
      orderBy: [
        { field: 'id', sort: 'asc' },
        { field: 'createdAt', sort: 'desc' }
      ]
    };

    expect(createQueryOptionsKey(cursorOptions(entity), LABEL)).not.toBe(createQueryOptionsKey(reversed, LABEL));
  });

  it('游标字段值不可序列化时仍报错，并带上调用方 label', () => {
    class BadEntity {
      readonly id = 'c1';
      readonly createdAt = (): string => 'not serializable';
    }

    expect(() => createQueryOptionsKey(cursorOptions(wrap(new BadEntity())), LABEL)).toThrow(
      /RxDB query options must contain serializable values/
    );
  });

  it('无游标时循环引用的报错原样透传', () => {
    const options: Record<string, unknown> = { where: {} };
    options.self = options;

    expect(() => createQueryOptionsKey(options, LABEL)).toThrow(/circular references/);
  });

  // 带游标的自引用选项：投影是顶层浅拷贝，自引用会把序列化带回**原始** options，
  // 于是先撞上未投影的游标原型、报「serializable」而不是「circular」。
  // 两者都是 TypeError，都不产出 key、也不无限递归 —— 这才是本用例锁的契约。
  it('带游标时循环引用仍被拒绝', () => {
    const options: Record<string, unknown> = cursorOptions(wrap(new ProbeEntity('c1', new Date(0), '甲')));
    options.self = options;

    expect(() => createQueryOptionsKey(options, LABEL)).toThrow(TypeError);
  });

  it.each([
    ['无游标的普通选项', { where: { combinator: 'and', rules: [] }, limit: 10 }],
    ['显式 undefined 游标', { where: {}, after: undefined }],
    ['null 游标', { where: {}, after: null }],
    ['非对象入参', 'plain-string'],
    ['数组入参', [1, 2, 3]]
  ])('%s 与 createStableKey 结果完全一致', (_name, options) => {
    expect(createQueryOptionsKey(options, LABEL)).toBe(createStableKey(options, LABEL));
  });

  it('不改写传入的 options', () => {
    const entity = wrap(new ProbeEntity('c1', new Date('2026-01-01T00:00:00.000Z'), '甲'));
    const options = cursorOptions(entity);

    createQueryOptionsKey(options, LABEL);

    expect(options.after).toBe(entity);
    expect(Object.keys(options).sort()).toEqual(['after', 'limit', 'orderBy', 'where']);
  });
});
