import { describe, expect, it } from 'vitest';
import { compileAngular } from './angular-compiler';

describe('compileAngular', () => {
  it('preserves ESM and converts Angular legacy decorators without constructor metadata', async () => {
    const source = `import { Component, inject, signal } from '@angular/core';
@Component({ selector: 'app-root', template: '{{ count() }}' })
export class App {
  readonly count = signal<number>(0);
  readonly service = inject(CounterService);
}`;
    const output = await compileAngular(source, 'src/app.ts');
    expect(output).toContain("from '@angular/core'");
    expect(output).toContain('Component({');
    expect(output).toContain('inject(CounterService)');
    expect(output).not.toContain('@Component');
    expect(output).not.toContain('signal<number>');
    expect(output).not.toContain('design:paramtypes');
  });

  it('reports syntax diagnostics with the original file and location', async () => {
    await expect(compileAngular('export class App {\n readonly value = ;\n}', 'src/broken.ts')).rejects.toThrow(
      /src\/broken\.ts:2:\d+.*Expression expected/s
    );
  });

  it('keeps relative imports available to the shared project resolver', async () => {
    const output = await compileAngular("export { Counter } from './counter';", 'src/main.ts');
    expect(output).toContain("export { Counter } from './counter'");
  });
});
