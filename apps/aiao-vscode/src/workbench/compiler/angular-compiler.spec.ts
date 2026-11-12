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

  it('templateUrl 经解析器内联为 template，保留装饰器与模板文本', async () => {
    const result = await compileAngular(
      `import { Component } from '@angular/core';
@Component({ selector: 'app-root', templateUrl: './app.html' })
export class App {}`,
      '/src/app.ts',
      url => {
        expect(url).toBe('./app.html');
        return '<h1>外部模板</h1><p>{{ count() }}</p>';
      }
    );
    expect(result).toContain('Component({');
    expect(result).toContain('template: "<h1>外部模板</h1><p>{{ count() }}</p>"');
    expect(result).not.toContain('templateUrl');
  });

  it('templateUrl 解析失败透出诊断，不返回半成品', async () => {
    await expect(
      compileAngular('@Component({templateUrl: "./missing.html"}) export class App {}', '/src/app.ts', () => {
        throw new Error('找不到项目模块或资源：/src/missing.html');
      })
    ).rejects.toThrow('找不到项目模块或资源：/src/missing.html');
  });

  it('templateUrl 只接受字符串字面量', async () => {
    await expect(
      compileAngular(
        'const url = "./app.html"; @Component({templateUrl: url}) export class App {}',
        '/src/app.ts',
        () => '<h1>模板</h1>'
      )
    ).rejects.toThrow('templateUrl 只支持字符串字面量');
  });

  it('缺少项目快照解析器时 templateUrl 明确拒绝，不落到运行时 fetch', async () => {
    await expect(
      compileAngular('@Component({templateUrl: "./app.html"}) export class App {}', '/src/app.ts')
    ).rejects.toThrow('templateUrl 需要项目文件快照解析器');
  });
});
