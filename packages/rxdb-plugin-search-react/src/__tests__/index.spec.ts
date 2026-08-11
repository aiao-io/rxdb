import { describe, expect, it } from 'vitest';

import type { SearchExecutionError, SearchHandle, SearchOptions, SearchResult, SearchState } from '../index.js';
import * as publicApi from '../index.js';

type PublicSearchApi = {
  error: SearchExecutionError | undefined;
  handle: SearchHandle;
  options: SearchOptions;
  result: SearchResult;
  state: SearchState;
};

describe('React public search API', () => {
  it('exposes the core search types from the package entrypoint', () => {
    const contract: PublicSearchApi | undefined = undefined;
    expect(contract).toBeUndefined();
  });

  // 上面全是 `import type`，编译期即被抹除 —— 入口模块根本不会在运行时加载。
  // 这条断言才真正 import 桶文件，能抓到导出名写错 / 漏导出。
  it('re-exports useSearch as a runtime value', () => {
    expect(publicApi.useSearch).toBeTypeOf('function');
  });
  // SRCHR-006：`SearchExecutionError` 在 core 是**运行时 class**，
  // 这里却和纯类型一起 `export type` —— 真实 ESM 里它根本不存在，
  // 消费者拿到 `error` 后无法 `instanceof`，必须额外从 core import。三端同款债。
  it('re-exports SearchExecutionError as a runtime class', () => {
    expect(publicApi.SearchExecutionError).toBeTypeOf('function');

    const error = new publicApi.SearchExecutionError('boom');
    expect(error).toBeInstanceOf(publicApi.SearchExecutionError);
    expect(error).toBeInstanceOf(Error);
  });
});
