import { cloneEntityClasses, Entity, EntityBase, PropertyType, RxDBBranch, type EntityType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { READ_ONLY_REJECTION_TEXT, readOnlyCatalog, readOnlyTargetLabel } from './read-only-checkout';

/**
 * @fileoverview 只读检出位查看器的目录、标签与拒绝文案（US-313，Angular / Vue 端同名 spec 的移植）。
 */

@Entity({ name: 'ReadOnlyTodo', displayName: '待办', properties: [{ name: 'title', type: PropertyType.string }] })
class ReadOnlyTodo extends EntityBase {
  title!: string;
}

@Entity({
  name: 'ReadOnlyFile',
  namespace: 'storage',
  log: false,
  properties: [{ name: 'path', type: PropertyType.string }]
})
class ReadOnlyFile extends EntityBase {
  path!: string;
}

const main: readonly EntityType[] = [ReadOnlyTodo, ReadOnlyFile, RxDBBranch];
// 快照实例的实体全是 `log: false` 的克隆；核心系统实体两个实例共用同一个类
const snapshot: readonly EntityType[] = [
  ...cloneEntityClasses([ReadOnlyTodo, ReadOnlyFile], { log: false }),
  RxDBBranch
];

describe('readOnlyCatalog', () => {
  it('只列复制进快照的实体：与主实例共用的类（核心系统实体）不列', () => {
    expect(readOnlyCatalog(snapshot, main).map(entry => entry.key)).toEqual([
      'public:ReadOnlyTodo',
      'storage:ReadOnlyFile'
    ]);
  });

  it('按主实例上同名实体的 log 标「不随版本」：快照里的克隆一律不记日志，不能拿它判', () => {
    const [todo, file] = readOnlyCatalog(snapshot, main);
    expect(todo).toMatchObject({ namespace: 'public', name: 'ReadOnlyTodo', displayName: '待办', unversioned: false });
    expect(file).toMatchObject({
      namespace: 'storage',
      name: 'ReadOnlyFile',
      displayName: 'ReadOnlyFile',
      unversioned: true
    });
  });
});

describe('readOnlyTargetLabel', () => {
  it('分支视图写分支名，提交视图写提交号的前 7 位', () => {
    expect(readOnlyTargetLabel({ branchId: 'feature/x' })).toBe('branch feature/x');
    expect(readOnlyTargetLabel({ commitId: '0123456789abcdef' })).toBe('commit 0123456');
  });
});

describe('READ_ONLY_REJECTION_TEXT', () => {
  it('打不开的成因换成用户看得懂的提示；与 restore 同口径的两条用同一句话', () => {
    expect(READ_ONLY_REJECTION_TEXT.unreachable_target).toBe('This commit is not reachable from the current branch.');
    expect(READ_ONLY_REJECTION_TEXT.incompatible_schema).toBe(
      'This commit contains entities the current client cannot read.'
    );
    expect(READ_ONLY_REJECTION_TEXT.restoring_working_tree).toBe(
      'A restore is in progress. Finish or discard it before opening a commit.'
    );
  });
});
