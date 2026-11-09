import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Project } from 'ts-morph';
import { afterEach, describe, expect, it } from 'vitest';
import analyzeFile from '../../cli/analyze-file.js';

// 生成器只把 getter 自身的代码搬进生成的实体类，模块里的其他绑定不会跟过去：
// 引用它们的 getter 生成能成功，读取时却抛 ReferenceError，必须在生成前拒绝。
describe('analyzeFile 保留的 getter 只能引用自身可携带的绑定', () => {
  const tempDirs: string[] = [];
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    tsConfigFilePath: path.resolve(import.meta.dirname, '../../../../../tsconfig.base.json')
  });

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })));
  });

  const analyzeEntity = async (prelude: string, getter: string) => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-getter-binding-'));
    tempDirs.push(tempDir);
    await writeFile(path.join(tempDir, 'scale.ts'), 'export const scale = (value: number): number => value * 10;\n');
    const filePath = path.join(tempDir, 'measure.ts');
    await writeFile(
      filePath,
      `
        import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';
        ${prelude}

        @Entity({ name: 'Measure', properties: [{ name: 'value', type: PropertyType.number }] })
        class Measure extends EntityBase {
          value!: number;

          ${getter}
        }
      `
    );
    project.addSourceFileAtPath(filePath);
    project.resolveSourceFileDependencies();
    return () => analyzeFile(filePath, project);
  };

  it.each([
    ['同模块 helper', 'const double = (value: number): number => value * 2;', 'get doubled(): number { return double(this.value); }', 'double'],
    ['对象简写里的 helper', 'const double = (value: number): number => value * 2;', 'get snapshot() { return { double }; }', 'double'],
    ['import 进来的值', "import { scale } from './scale.js';", 'get scaled(): number { return scale(this.value); }', 'scale'],
    ['核心包导出的值', '', 'get kind(): string { return PropertyType.number; }', 'PropertyType']
  ])('%s：生成前拒绝并点名绑定', async (_label, prelude, getter, binding) => {
    const analyze = await analyzeEntity(prelude, getter);

    expect(analyze).toThrow(new RegExp(`Measure\\.\\w+ references "${binding}"`));
    expect(analyze).toThrow(/measure\.ts:\d+:\d+/);
  });

  it('this、自身局部变量、全局对象与只在类型位置出现的模块类型照常保留', async () => {
    const analyze = await analyzeEntity(
      "type Unit = 'cm' | 'm';",
      `get label(): string {
            const unit: Unit = 'cm';
            const rounded = Math.round(this.value);
            return \`\${JSON.stringify(rounded)}\${unit satisfies Unit}\${Measure.name}\`;
          }`
    );

    const [result] = analyze();

    expect(result.sourceGetters.map(getter => getter.name)).toEqual(['label']);
    expect(result.sourceGetters[0]?.runtime).toContain('Math.round(this.value)');
  });
});
