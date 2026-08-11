import { describe, expect, it, vi } from 'vitest';
import { hardenWaSqliteSynchronousCallbacks } from '../synchronous-callbacks.js';

type Callback = (...arguments_: readonly unknown[]) => unknown;

interface CallbackLayer {
  commit_hook(database: number, callback: Callback): unknown;
  create_function(
    database: number,
    name: string,
    argumentCount: number,
    textRepresentation: number,
    userData: number,
    callback: Callback,
    step: Callback,
    final: Callback
  ): unknown;
  progress_handler(database: number, operations: number, callback: Callback, userData: unknown): unknown;
  set_authorizer(database: number, callback: Callback, userData: unknown): unknown;
  update_hook(database: number, callback: Callback): unknown;
}

function createTranspiledDetectionLayer(results: boolean[]): CallbackLayer {
  const classify = (callback: Callback): Callback => {
    results.push(callback instanceof Function);
    return (...arguments_: readonly unknown[]) => callback(...arguments_);
  };
  return {
    commit_hook: (_database, callback) => classify(callback)('commit'),
    create_function: (_database, _name, _argumentCount, _textRepresentation, _userData, callback, step, final) => [
      classify(callback)('function'),
      classify(step)('step'),
      classify(final)('final')
    ],
    progress_handler: (_database, _operations, callback) => classify(callback)('progress'),
    set_authorizer: (_database, callback) => classify(callback)('authorizer'),
    update_hook: (_database, callback) => classify(callback)('update')
  };
}

function invokeLayer(layer: CallbackLayer, callback: Callback): unknown[] {
  return [
    layer.set_authorizer(1, callback, undefined),
    layer.update_hook(1, callback),
    layer.commit_hook(1, callback),
    layer.progress_handler(1, 100, callback, undefined),
    layer.create_function(1, 'test', 1, 1, 0, callback, callback, callback)
  ];
}

describe('hardenWaSqliteSynchronousCallbacks', () => {
  it('AsyncFunction 被转译成 Function 时双层都不把同步回调标记为异步', () => {
    const moduleDetections: boolean[] = [];
    const apiDetections: boolean[] = [];
    const moduleLayer = hardenWaSqliteSynchronousCallbacks(createTranspiledDetectionLayer(moduleDetections));
    const apiLayer = hardenWaSqliteSynchronousCallbacks(createTranspiledDetectionLayer(apiDetections));
    const callback = vi.fn((value: unknown) => value);

    const apiResults = invokeLayer(apiLayer, callback);
    const moduleResults = invokeLayer(moduleLayer, callback);

    expect(apiResults).toEqual(['authorizer', 'update', 'commit', 'progress', ['function', 'step', 'final']]);
    expect(moduleResults).toEqual(apiResults);
    expect(apiDetections).toEqual([false, false, false, false, false, false, false]);
    expect(moduleDetections).toEqual(apiDetections);
    expect(callback).toHaveBeenCalledTimes(14);
    expect(apiResults.every(result => !(result instanceof Promise))).toBe(true);
  });

  it('重复加固同一目标时不再包一层', () => {
    const detections: boolean[] = [];
    const layer = createTranspiledDetectionLayer(detections);
    const original = layer.update_hook;

    hardenWaSqliteSynchronousCallbacks(layer);
    const wrapped = layer.update_hook;
    hardenWaSqliteSynchronousCallbacks(layer);

    expect(wrapped).not.toBe(original);
    expect(layer.update_hook).toBe(wrapped);
    expect(layer.update_hook(1, value => value)).toBe('update');
    expect(detections).toEqual([false]);
  });

  it('跳过缺失的方法并原样透传非函数回调', () => {
    const target = {
      update_hook: (_database: number, callback: unknown) => callback
    };

    hardenWaSqliteSynchronousCallbacks(target);

    expect(target.update_hook(1, 0)).toBe(0);
    expect(target.update_hook(1, null)).toBeNull();
  });

  it('保留非回调参数、this 和同步返回值', () => {
    const target = {
      prefix: 'sqlite',
      set_authorizer(this: { prefix: string }, database: number, callback: Callback, userData: string) {
        return `${this.prefix}:${database}:${callback(userData)}`;
      }
    };
    hardenWaSqliteSynchronousCallbacks(target);

    const result = target.set_authorizer(42, value => `sync:${String(value)}`, 'user');

    expect(result).toBe('sqlite:42:sync:user');
    expect(result).not.toBeInstanceOf(Promise);
  });
});
