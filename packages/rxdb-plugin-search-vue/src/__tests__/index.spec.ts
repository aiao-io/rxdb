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

describe('Vue public search API', () => {
  it('exposes the core search types from the package entrypoint', () => {
    const contract: PublicSearchApi | undefined = undefined;
    expect(contract).toBeUndefined();
  });
  // SRCHV-010：上面全是 `import type`，编译期即被抹除 —— 入口模块根本不会在运行时加载，
  // 即使删掉 `export { useSearch }` 这份 spec 也照样通过。React / Angular 都有该断言，Vue 漏了。
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
