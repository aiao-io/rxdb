import { PropertyType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { RxDBClientGenerator } from '../core/RxDBClientGenerator.js';
import { compileGeneratedConsumer } from '../testing/generated-consumer.js';

const generateEntity = (): RxDBClientGenerator => {
  const generator = new RxDBClientGenerator();
  generator.addEntity({
    name: 'Task',
    namespace: 'public',
    repository: 'Repository',
    extends: ['EntityBase'],
    properties: [{ name: 'title', type: PropertyType.string }]
  });
  generator.exec();
  return generator;
};

describe('generated entity static members', () => {
  it('compiles the concrete Repository API against EntityBase static members', async () => {
    const generator = generateEntity();

    await expect(
      compileGeneratedConsumer(
        generator.getSourceFiles(),
        [
          "import { Task } from './generated/index.js';",
          "import type { Observable } from 'rxjs';",
          "const id = '00000000-0000-0000-0000-000000000000';",
          'const task: Observable<Task> = Task.get(id);',
          'declare class SpecializedTask extends Task {}',
          'const specialized: Observable<SpecializedTask> = SpecializedTask.get(id);',
          'void task;',
          'void specialized;'
        ].join('\n')
      )
    ).resolves.toEqual([]);
  });
});
