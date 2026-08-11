import type { Observable, Subscription } from 'rxjs';

export type ObservableStep<T> = {
  validate: (value: T) => void | Promise<void>;
  run?: () => Promise<void>;
};

/**
 * 断言 observable 按预期顺序准确发射，同时允许每一步触发下一步动作。
 */
export const expectObservableSequence = async <T>(
  observable: Observable<T>,
  steps: ObservableStep<T>[],
  timeoutMs = 5000,
  settleMs = 50
) =>
  new Promise<void>((resolve, reject) => {
    let index = 0;
    let settled = false;
    let chain = Promise.resolve();
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    const timeoutTimer = setTimeout(() => {
      fail(new Error(`Observable sequence timed out at step ${index + 1}/${steps.length}`));
    }, timeoutMs);

    const toError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

    /**
     * 收尾：退订并按「序列结果 + teardown 结果」两者共同决定 settle 方式。
     *
     * @remarks
     * RXT-001：早先这里是 `subscription.unsubscribe(); callback();`。teardown 抛错时
     * `callback` 从不执行，而 `settled` 已经置位，后续 `fail` 直接 return —— 断言 Promise
     * 永久 pending，整个测试文件挂到 vitest 超时，报的还是无关的超时错误。
     * 所以 unsubscribe 必须被捕获，且 teardown 错误不得盖掉真正的序列失败原因。
     */
    function finish(sequenceError: Error | undefined): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      if (settleTimer) clearTimeout(settleTimer);

      let teardownError: Error | undefined;
      try {
        subscription?.unsubscribe();
      } catch (error) {
        teardownError = toError(error);
      }

      if (sequenceError && teardownError) {
        reject(
          new AggregateError([sequenceError, teardownError], 'observable sequence failed and teardown threw', {
            cause: sequenceError
          })
        );
        return;
      }
      if (sequenceError) {
        reject(sequenceError);
        return;
      }
      if (teardownError) {
        reject(teardownError);
        return;
      }
      resolve();
    }

    function fail(error: unknown): void {
      finish(toError(error));
    }

    function succeed(): void {
      finish(undefined);
    }

    function beginSettle(): void {
      if (settled) return;
      if (settleMs <= 0) {
        succeed();
        return;
      }
      settleTimer = setTimeout(succeed, settleMs);
    }

    function schedule(task: () => void | Promise<void>): void {
      chain = chain
        .then(async () => {
          if (!settled) await task();
        })
        .catch(fail);
    }

    const subscription: Subscription = observable.subscribe({
      next: value => {
        schedule(async () => {
          const step = steps[index];
          if (!step) {
            fail(new Error(`Observable sequence received unexpected extra emission at step ${index + 1}`));
            return;
          }

          await step.validate(value);
          if (settled) return;

          index += 1;
          // run 必须先于 beginSettle 执行：末步的 run 常被用来做「删除记录后应无新发射」
          // 这类收尾副作用，早先在这里直接 return 会把它静默跳过，测试假绿。
          if (step.run) {
            await step.run();
            if (settled) return;
          }

          if (index >= steps.length) {
            beginSettle();
          }
        });
      },
      error: error => {
        schedule(() => fail(error));
      },
      complete: () => {
        schedule(() => {
          if (index < steps.length) {
            fail(new Error(`Observable sequence completed at step ${index + 1}/${steps.length}`));
            return;
          }
          succeed();
        });
      }
    });

    if (steps.length === 0) schedule(beginSettle);
  });
