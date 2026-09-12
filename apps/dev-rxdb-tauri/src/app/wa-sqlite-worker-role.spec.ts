/**
 * wa-sqlite worker 上下文角色判定的页内单测。
 *
 * @remarks
 * 这个判定只会在运行时以「worker 永远不响应」的形态暴露，而那个形态与「worker 压根没加载」
 * 完全一样。单独抽成纯函数来测，是因为 worker 入口文件本身一 import 就接线（comlink expose），
 * 测试环境没有那一层运行时。
 */

import { resolveWaSqliteWorkerRole } from './wa-sqlite-worker-role';

class FakeDedicatedScope {}
class FakeSharedWorkerScope {}

/** 拼一个假全局对象：只有 shared worker 上下文才同时有构造器且 self 是它的实例。 */
const fakeGlobals = (ctor: unknown, self: unknown): unknown => ({
  SharedWorkerGlobalScope: ctor,
  self
});

describe('wa-sqlite worker 上下文角色判定', () => {
  it('没有 SharedWorkerGlobalScope 构造器的上下文按 dedicated 接线', () => {
    expect(resolveWaSqliteWorkerRole({ self: new FakeDedicatedScope() })).toBe('dedicated');
  });

  it('SharedWorkerGlobalScope 存在且 self 是它的实例时按 shared 接线', () => {
    const scope = new FakeSharedWorkerScope();
    expect(resolveWaSqliteWorkerRole(fakeGlobals(FakeSharedWorkerScope, scope))).toBe('shared');
  });

  it('SharedWorkerGlobalScope 存在但 self 不是实例（构造器可见的普通窗口）时按 dedicated 接线', () => {
    // 构造器在窗口上下文也可能可见；只有「self 就是那个全局作用域」才算 shared。
    expect(resolveWaSqliteWorkerRole(fakeGlobals(FakeSharedWorkerScope, new FakeDedicatedScope()))).toBe('dedicated');
  });
});
