import { Observable, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { expectObservableSequence } from '../../testing/observable-sequence.js';

describe('expectObservableSequence', () => {
  it('runs each step in sequence and allows a step to trigger the next emission', async () => {
    const values = new Subject<number>();
    const teardown = vi.fn();
    const observable = new Observable<number>(subscriber => {
      const subscription = values.subscribe(subscriber);
      return () => {
        subscription.unsubscribe();
        teardown();
      };
    });
    let didRunNextStep = false;

    const assertion = expectObservableSequence(
      observable,
      [
        {
          validate: value => {
            expect(value).toBe(1);
          },
          run: async () => {
            didRunNextStep = true;
            values.next(2);
          }
        },
        {
          validate: value => {
            expect(didRunNextStep).toBe(true);
            expect(value).toBe(2);
          }
        }
      ],
      1000,
      0
    );

    values.next(1);
    await assertion;

    expect(teardown).toHaveBeenCalledOnce();
  });

  it('rejects an extra emission during the settle window', async () => {
    const values = new Subject<number>();
    let validated = false;
    const assertion = expectObservableSequence(
      values,
      [
        {
          validate: value => {
            expect(value).toBe(1);
            validated = true;
          }
        }
      ],
      1000,
      50
    );

    values.next(1);
    await vi.waitFor(() => expect(validated).toBe(true));
    values.next(2);

    await expect(assertion).rejects.toThrow('unexpected extra emission');
  });

  it('preserves a synchronous observable error and unsubscribes once', async () => {
    const failure = new Error('sync failure');
    const teardown = vi.fn();
    const observable = new Observable<number>(subscriber => {
      subscriber.error(failure);
      return teardown;
    });

    await expect(expectObservableSequence(observable, [], 100, 0)).rejects.toBe(failure);
    expect(teardown).toHaveBeenCalledOnce();
  });

  it('does not run a step action after validation has timed out', async () => {
    let releaseValidation: (() => void) | undefined;
    const validation = new Promise<void>(resolve => {
      releaseValidation = resolve;
    });
    const run = vi.fn(async () => undefined);
    const teardown = vi.fn();
    const observable = new Observable<number>(subscriber => {
      subscriber.next(1);
      return teardown;
    });

    const assertion = expectObservableSequence(
      observable,
      [{ validate: () => validation, run }, { validate: () => undefined }],
      20,
      0
    );

    await expect(assertion).rejects.toThrow('timed out at step 1/2');
    releaseValidation?.();
    await validation;
    await Promise.resolve();

    expect(run).not.toHaveBeenCalled();
    expect(teardown).toHaveBeenCalledOnce();
  });

  it('rejects completion before every expected value arrives', async () => {
    const observable = new Observable<number>(subscriber => {
      subscriber.next(1);
      subscriber.complete();
    });

    await expect(
      expectObservableSequence(observable, [{ validate: () => undefined }, { validate: () => undefined }], 100, 0)
    ).rejects.toThrow('completed at step 2/2');
  });
});

describe('expectObservableSequence terminal behavior', () => {
  it('resolves after a quiet positive settle window', async () => {
    const values = new Subject<number>();
    const assertion = expectObservableSequence(values, [{ validate: value => expect(value).toBe(1) }], 1000, 5);

    values.next(1);

    await expect(assertion).resolves.toBeUndefined();
  });

  it('normalizes a non-Error observable failure', async () => {
    const observable = new Observable<number>(subscriber => {
      subscriber.error('broken');
    });

    await expect(expectObservableSequence(observable, [], 100, 0)).rejects.toThrow('broken');
  });

  it('propagates validation failures', async () => {
    const values = new Subject<number>();
    const assertion = expectObservableSequence(
      values,
      [{ validate: () => Promise.reject(new Error('invalid value')) }],
      100,
      0
    );

    values.next(1);

    await expect(assertion).rejects.toThrow('invalid value');
  });

  it('accepts synchronous completion after the full sequence', async () => {
    const observable = new Observable<number>(subscriber => {
      subscriber.next(1);
      subscriber.complete();
    });

    await expect(
      expectObservableSequence(observable, [{ validate: value => expect(value).toBe(1) }], 100, 50)
    ).resolves.toBeUndefined();
  });

  it('accepts an empty sequence after the settle window', async () => {
    await expect(expectObservableSequence(new Subject<number>(), [], 100, 1)).resolves.toBeUndefined();
  });

  // 末步的 run 此前被 `index >= steps.length` 的提前 return 跳过，且没有任何报错。
  // 调用方在末步 run 里写「删除记录后应无新发射」这类副作用时，测试静默变绿但什么都没跑。
  // 该工具已被 sqlite-core 的 test-utils 复用，影响所有 sqlite 系适配器。
  it('runs the final step run callback before settling', async () => {
    const values = new Subject<number>();
    const finalRun = vi.fn();

    const assertion = expectObservableSequence(
      values,
      [{ validate: value => expect(value).toBe(1) }, { validate: value => expect(value).toBe(2), run: finalRun }],
      1000,
      10
    );

    values.next(1);
    values.next(2);

    await expect(assertion).resolves.toBeUndefined();
    expect(finalRun).toHaveBeenCalledTimes(1);
  });

  it('fails when the final step run callback throws', async () => {
    const values = new Subject<number>();

    const assertion = expectObservableSequence(
      values,
      [
        {
          validate: value => expect(value).toBe(1),
          run: () => {
            throw new Error('final run failed');
          }
        }
      ],
      1000,
      10
    );

    values.next(1);

    await expect(assertion).rejects.toThrow('final run failed');
  });

  // RXT-001：`finish()` 先置 settled、再 unsubscribe。teardown 抛错时 callback 从未执行，
  // 后续的 fail 又因 settled 直接 return，断言 Promise 永久 pending —— 整个测试文件挂到
  // vitest 超时，报的还是无关的超时错误。teardown 抛错必须让断言快速 reject。
  it('rejects instead of hanging when teardown throws on success', async () => {
    const values = new Subject<number>();
    const observable = new Observable<number>(subscriber => {
      const subscription = values.subscribe(subscriber);
      return () => {
        subscription.unsubscribe();
        throw new Error('teardown exploded');
      };
    });

    const assertion = expectObservableSequence(observable, [{ validate: value => expect(value).toBe(1) }], 1000, 0);

    values.next(1);

    await expect(assertion).rejects.toThrow('teardown exploded');
  });

  // 序列本身失败、teardown 又抛错时，teardown 的错误不得盖掉真正的断言失败原因。
  it('preserves both causes when the sequence fails and teardown throws', async () => {
    const values = new Subject<number>();
    const teardownError = new Error('teardown exploded');
    const observable = new Observable<number>(subscriber => {
      const subscription = values.subscribe(subscriber);
      return () => {
        subscription.unsubscribe();
        throw teardownError;
      };
    });

    const assertion = expectObservableSequence(
      observable,
      [
        {
          validate: () => {
            throw new Error('validation failed');
          }
        }
      ],
      1000,
      0
    );

    values.next(1);

    const rejection = await assertion.then(
      () => undefined,
      (error: unknown) => error
    );

    expect(rejection).toBeInstanceOf(AggregateError);
    const errors = (rejection as AggregateError).errors as Error[];
    expect(errors[0].message).toBe('validation failed');
    // RxJS 把 teardown 抛出的异常包进 UnsubscriptionError，原始错误在其 `errors` 里。
    expect(errors[1].message).toContain('teardown exploded');
    expect((errors[1] as unknown as AggregateError).errors).toContain(teardownError);
  });
});
