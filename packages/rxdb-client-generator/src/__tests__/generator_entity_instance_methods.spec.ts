import { PropertyType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { RxDBClientGenerator } from '../core/RxDBClientGenerator.js';
import type { GeneratorContext } from '../generators/RepositoryGenerator.interface.js';
import { RepositoryGeneratorBase } from '../generators/RepositoryGeneratorBase.js';
import { compileGeneratedConsumer } from './helpers/generated-consumer.js';

class CustomRepositoryGenerator extends RepositoryGeneratorBase {
  readonly name = 'CustomRepository';

  protected generateMethods(context: GeneratorContext): void {
    this.addStaticMethod(context, {
      method: 'lookup',
      options: 'UUID',
      returnType: context.metadata.name
    });
    this.addInstanceMethod(context, {
      name: 'refresh',
      returnType: 'void',
      docs: ['刷新']
    });
  }
}

const generateTaskEntity = (): RxDBClientGenerator => {
  const generator = new RxDBClientGenerator();
  generator.addEntity({
    name: 'Task',
    namespace: 'public',
    repository: 'Repository',
    extends: ['EntityBase'],
    properties: [
      {
        name: 'title',
        type: PropertyType.string
      }
    ]
  });
  generator.exec();
  return generator;
};

describe('generated entity instance methods', () => {
  it('emits callable properties compatible with EntityBase declarations', () => {
    const generator = generateTaskEntity();
    const declaration = generator.getSourceFiles().find(file => file.getFilePath() === 'index.d.ts');
    const text = declaration?.getText() ?? '';

    expect(text).toContain('remove: () => Promise<this>;');
    expect(text).toContain('reset: () => void;');
    expect(text).toContain('save: () => Promise<this>;');
    expect(text).not.toContain('remove(): Promise<Task>;');
    expect(text).not.toContain('reset(): void;');
    expect(text).not.toContain('save(): Promise<Task>;');
  });

  it('compiles generated declarations against the EntityBase member contract', async () => {
    const generator = generateTaskEntity();

    await expect(
      compileGeneratedConsumer(
        generator.getSourceFiles(),
        [
          "import { Task } from './generated/index.js';",
          'declare const task: Task;',
          'const removed: Promise<Task> = task.remove();',
          'task.reset();',
          'const saved: Promise<Task> = task.save();',
          'declare class SpecializedTask extends Task {}',
          'declare const specialized: SpecializedTask;',
          'const specializedSaved: Promise<SpecializedTask> = specialized.save();'
        ].join('\n')
      )
    ).resolves.toEqual([]);
  });

  it('preserves custom repository method generation', () => {
    const generator = new RxDBClientGenerator();
    generator.registerRepositoryGenerator(new CustomRepositoryGenerator());
    generator.addEntity({
      name: 'Task',
      namespace: 'public',
      repository: 'CustomRepository',
      extends: ['EntityBase'],
      properties: [{ name: 'title', type: PropertyType.string }]
    });
    generator.exec();

    const declaration = generator.getSourceFiles().find(file => file.getFilePath() === 'index.d.ts');
    const text = declaration?.getText() ?? '';

    expect(text).toContain('lookup 查询');
    expect(text).toContain('static lookup(options?: UUID): Observable<Task>;');
    expect(text).toContain('refresh(): void;');
  });
});
