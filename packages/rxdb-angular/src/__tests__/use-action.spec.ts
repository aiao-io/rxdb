import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAction } from '../use-action';

describe('useAction', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()]
    });
  });
  it('should create an action with isPending signal', () => {
    TestBed.runInInjectionContext(() => {
      const mockFn = vi.fn(async () => 'result');
      const action = useAction(mockFn);

      expect(action.isPending).toBeDefined();
      expect(action.execute).toBeDefined();
      expect(action.isPending()).toBe(false);
    });
  });

  it('should set isPending to true during execution', async () => {
    await TestBed.runInInjectionContext(async () => {
      let resolvePromise: (value: string) => void;
      const mockFn = vi.fn(
        () =>
          new Promise<string>(resolve => {
            resolvePromise = resolve;
          })
      );
      const action = useAction(mockFn);

      const executePromise = action.execute();
      expect(action.isPending()).toBe(true);

      resolvePromise!('result');
      await executePromise;
      expect(action.isPending()).toBe(false);
    });
  });

  it('should execute the promise function with options', async () => {
    await TestBed.runInInjectionContext(async () => {
      const mockFn = vi.fn(async (options?: { id: number }) => `result-${options?.id}`);
      const action = useAction(mockFn);

      const result = await action.execute({ id: 123 });

      expect(mockFn).toHaveBeenCalledWith({ id: 123 });
      expect(result).toBe('result-123');
    });
  });

  it('should reset isPending to false after success', async () => {
    await TestBed.runInInjectionContext(async () => {
      const mockFn = vi.fn(async () => 'success');
      const action = useAction(mockFn);

      await action.execute();

      expect(action.isPending()).toBe(false);
    });
  });

  it('should reset isPending to false after error', async () => {
    await TestBed.runInInjectionContext(async () => {
      const mockFn = vi.fn(async () => {
        throw new Error('test error');
      });
      const action = useAction(mockFn);

      await expect(action.execute()).rejects.toThrow('test error');
      expect(action.isPending()).toBe(false);
    });
  });

  it('should keep isPending true until all concurrent executions settle', async () => {
    await TestBed.runInInjectionContext(async () => {
      const resolvers: Array<(value: string) => void> = [];
      const mockFn = vi.fn(
        () =>
          new Promise<string>(resolve => {
            resolvers.push(resolve);
          })
      );
      const action = useAction(mockFn);

      const first = action.execute();
      const second = action.execute();
      expect(action.isPending()).toBe(true);

      // 先完成第一个：仍有一个在途，isPending 应保持 true
      resolvers[0]('a');
      await first;
      expect(action.isPending()).toBe(true);

      // 第二个完成后才归零
      resolvers[1]('b');
      await second;
      expect(action.isPending()).toBe(false);
    });
  });

  it('should return the result from promise function', async () => {
    await TestBed.runInInjectionContext(async () => {
      const mockFn = vi.fn(async () => ({ data: 'test' }));
      const action = useAction(mockFn);

      const result = await action.execute();

      expect(result).toEqual({ data: 'test' });
    });
  });
});
