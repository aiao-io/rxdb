import { describe, expect, it } from 'vitest';
import { SyncScenarioFixture } from './test-fixtures.js';

/**
 * 冲突夹具必须给出「同一实体」的两个版本：按 namespace + entity + entityId 配对冲突的消费者
 * 拿到两个不同 id 会当成两条无关实体，走不到冲突分支，测试却照样通过。
 */
describe('SyncScenarioFixture.createConflict', () => {
  it('local 与 remote 指向同一实体、同一字段的两个不同版本', () => {
    const { local, remote } = SyncScenarioFixture.createConflict();

    expect(remote.entityId).toBe(local.entityId);
    expect(remote.field).toBe(local.field);
    expect(remote.value).not.toBe(local.value);
    expect(remote.changeId).not.toBe(local.changeId);
  });

  it('每次调用生成新的冲突实体', () => {
    const first = SyncScenarioFixture.createConflict();
    const second = SyncScenarioFixture.createConflict();

    expect(second.local.entityId).not.toBe(first.local.entityId);
  });
});
