import { describe, expect, it } from 'vitest';
import { compileAngular } from './angular-compiler.js';

describe('Angular TS 语义转译', () => {
  it('保留 ESM 导入与 legacy 装饰器，不把类字段改成赋值初始化', async () => {
    const result = await compileAngular(
      'import {Component,signal} from "@angular/core"; @Component({template:"{{count()}}"}) export class App { readonly count = signal(0); }',
      'src/app.ts'
    );
    expect(result).toContain('from "@angular/core"');
    expect(result).toContain('__decorate');
    expect(result).toContain('count = signal(0)');
  });

  it('语法错误带文件、行列位置，不返回半成品', async () => {
    await expect(compileAngular('export class App {\n value: = 1;\n}', 'src/broken.ts')).rejects.toThrow(
      'src/broken.ts:2:'
    );
  });
});
