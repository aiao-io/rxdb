import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InjectedFailure, parseFailStep, runPipeline } from './lib/pipeline.mjs';

/**
 * 发布流水线的执行器（ADMIN-US-217 AC#2）：任一步失败即停止，后面的步骤一个都不执行；已生效步骤登记的补偿按相反顺序执行。
 * 失败注入与真实失败走同一条路径。
 */
const quiet = () => undefined;
function recorder() {
  const calls = [];
  const step = (n, name, work = async () => undefined) => ({
    n,
    name,
    run: async context => {
      calls.push(`run:${name}`);
      await work(context);
      await context.checkpoint();
    }
  });
  return { calls, step };
}

describe('发布流水线执行器', () => {
  it('全部成功时按顺序执行每一步，不执行任何补偿', async () => {
    const { calls, step } = recorder();
    const result = await runPipeline(
      [
        step(1, 'migrate'),
        step(2, 'deploy', async context => context.onRollback('restore', async () => void calls.push('undo')))
      ],
      { log: quiet }
    );
    assert.equal(result.ok, true);
    assert.equal(result.failed, null);
    assert.deepEqual(calls, ['run:migrate', 'run:deploy']);
    assert.deepEqual(
      result.steps.map(item => item.status),
      ['ok', 'ok']
    );
    assert.deepEqual(result.compensations, []);
  });
  it('第 N 步失败即停止：之后的步骤标为跳过，已登记的补偿按相反顺序执行', async () => {
    const { calls, step } = recorder();
    const result = await runPipeline(
      [
        step(1, 'a', async context => context.onRollback('undo-a', async () => void calls.push('undo:a'))),
        step(2, 'b', async context => context.onRollback('undo-b', async () => void calls.push('undo:b'))),
        step(3, 'c', async () => {
          throw new Error('build failed\nstack line');
        }),
        step(4, 'd')
      ],
      { log: quiet }
    );
    assert.equal(result.ok, false);
    assert.deepEqual(result.failed, { n: 3, name: 'c', error: 'build failed', injected: false });
    assert.deepEqual(calls, ['run:a', 'run:b', 'run:c', 'undo:b', 'undo:a']);
    assert.deepEqual(
      result.steps.map(item => [item.n, item.status]),
      [
        [1, 'ok'],
        [2, 'ok'],
        [3, 'failed'],
        [4, 'skipped']
      ]
    );
    assert.deepEqual(result.compensations, [
      { name: 'undo-b', status: 'ok' },
      { name: 'undo-a', status: 'ok' }
    ]);
  });
  it('注入的失败在该步的注入点抛出：这一步的工作已做完，下一步不执行', async () => {
    for (const failStep of [1, 2, 3]) {
      const { calls, step } = recorder();
      const result = await runPipeline([step(1, 'a'), step(2, 'b'), step(3, 'c')], { failStep, log: quiet });
      assert.equal(result.ok, false);
      assert.equal(result.failed.n, failStep);
      assert.equal(result.failed.injected, true);
      assert.match(result.failed.error, new RegExp(`ADMIN_DEPLOY_FAIL_STEP=${failStep}`));
      assert.deepEqual(
        calls,
        ['run:a', 'run:b', 'run:c'].slice(0, failStep)
      );
    }
  });
  it('补偿本身失败时记下来，其余补偿照常执行', async () => {
    const { calls, step } = recorder();
    const result = await runPipeline(
      [
        step(1, 'a', async context => context.onRollback('undo-a', async () => void calls.push('undo:a'))),
        step(2, 'b', async context =>
          context.onRollback('undo-b', async () => {
            throw new Error('docker down');
          })
        ),
        step(3, 'c')
      ],
      { failStep: 3, log: quiet }
    );
    assert.deepEqual(result.compensations, [
      { name: 'undo-b', status: 'failed', error: 'docker down' },
      { name: 'undo-a', status: 'ok' }
    ]);
    assert.ok(calls.includes('undo:a'));
  });
  it('没有经过注入点的步骤按失败处理：保证每一步都能被注入失败', async () => {
    const result = await runPipeline([{ n: 1, name: 'forgot', run: async () => undefined }], { log: quiet });
    assert.equal(result.ok, false);
    assert.match(result.failed.error, /没有经过失败注入点/);
  });
  it('失败注入的设置：未设为 null，越界或不是整数时报错', () => {
    assert.equal(parseFailStep(undefined, 8), null);
    assert.equal(parseFailStep('', 8), null);
    assert.equal(parseFailStep('8', 8), 8);
    for (const value of ['0', '9', '2.5', 'x']) assert.throws(() => parseFailStep(value, 8), /1～8/);
    assert.ok(new InjectedFailure(3) instanceof Error);
  });
});
