import { describe, expect, it } from 'vitest';
import { subframeGlueVitePlugin } from '../subframe-glue-plugin.js';

type Transform = (code: string, id: string) => { code: string; map: null } | null;

const transform = subframeGlueVitePlugin().transform as Transform;

const GLUE_ID = '/app/node_modules/@subframe7536/sqlite-wasm/dist/wa-sqlite-Dk3a9.js';

describe('subframeGlueVitePlugin', () => {
  it('在其他插件之前改写', () => {
    expect(subframeGlueVitePlugin().enforce).toBe('pre');
  });

  it('把 glue 里的 import.meta.url 全部抹成空串', () => {
    const result = transform('var a=import.meta.url;new URL("x.wasm",import.meta.url)', `${GLUE_ID}?v=1`);

    expect(result).toEqual({ code: 'var a="";new URL("x.wasm","")', map: null });
  });

  it('Windows 路径分隔符也认', () => {
    expect(
      transform('import.meta.url', 'C:\\app\\node_modules\\@subframe7536\\sqlite-wasm\\dist\\wa-sqlite-x.js')
    ).toEqual({
      code: '""',
      map: null
    });
  });

  it('不是 glue 或没有 import.meta.url 时不动', () => {
    expect(transform('import.meta.url', '/app/src/app.ts')).toBeNull();
    expect(transform('import.meta.url', '/app/node_modules/@subframe7536/sqlite-wasm/dist/index.js')).toBeNull();
    expect(transform('var a=1', GLUE_ID)).toBeNull();
  });
});
