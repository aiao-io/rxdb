import { PropertyType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { RxDBClientGenerator } from '../core/RxDBClientGenerator.js';
import { compileGeneratedConsumer } from './helpers/generated-consumer.js';

const generateEntity = (options: { tree?: boolean } = {}): RxDBClientGenerator => {
  const generator = new RxDBClientGenerator();
  generator.addEntity({
    name: options.tree ? 'Folder' : 'Task',
    namespace: 'public',
    repository: options.tree ? 'TreeRepository' : 'Repository',
    extends: [options.tree ? 'TreeAdjacencyListEntityBase' : 'EntityBase'],
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

  it('compiles concrete tree queries against TreeAdjacencyListEntityBase static members', async () => {
    const generator = generateEntity({ tree: true });

    await expect(
      compileGeneratedConsumer(
        generator.getSourceFiles(),
        [
          "import { Folder } from './generated/index.js';",
          "import type { Observable } from 'rxjs';",
          'const descendants: Observable<Folder[]> = Folder.findDescendants();',
          'declare class SpecializedFolder extends Folder {}',
          'const specialized: Observable<SpecializedFolder[]> = SpecializedFolder.findDescendants({});',
          'void descendants;',
          'void specialized;'
        ].join('\n')
      )
    ).resolves.toEqual([]);
  });
});
