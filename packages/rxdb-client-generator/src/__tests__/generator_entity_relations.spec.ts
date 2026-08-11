/**
 * @fileoverview 测试 generateEntityRelations 对 InitData 的影响
 *
 * 验证规则：
 * - ONE_TO_ONE / MANY_TO_ONE：外键 xxxId 应出现在 InitData 中
 * - ONE_TO_MANY / MANY_TO_MANY：不向 InitData 添加任何字段
 */
import { PropertyType, RelationKind } from '@aiao/rxdb';
import { beforeAll, describe, expect, it } from 'vitest';
import { RxDBClientGenerator } from '../core/RxDBClientGenerator.js';
import { Project, SourceFile } from '../core/ts-morph-browser.js';
import { generateEntityDefinition } from '../generators/entity-definition.js';
import { compileGeneratedConsumer } from './helpers/generated-consumer.js';

// 公共辅助：通过 addEntity 注册并返回完整初始化的 EntityMetadata
const addSimpleEntity = (generator: RxDBClientGenerator, name: Capitalize<string>) => {
  generator.addEntity({
    name,
    namespace: 'public',
    displayName: name,
    repository: 'Repository',
    extends: ['EntityBase'],
    properties: [{ name: 'id', type: PropertyType.uuid, nullable: false, readonly: true }],
    computedProperties: [],
    relations: [],
    indexes: []
  });
  return generator.getMetadata(name, 'public')!;
};

describe('generator_entity_relations — InitData 关系字段注入', () => {
  beforeAll(() => {
    process.setMaxListeners(0);
  });

  it('MANY_TO_ONE：外键 xxxId 应出现在 InitData 中（非 nullable）', () => {
    const generator = new RxDBClientGenerator();
    addSimpleEntity(generator, 'Author');
    generator.addEntity({
      name: 'Post',
      namespace: 'public',
      displayName: 'Post',
      repository: 'Repository',
      extends: ['EntityBase'],
      properties: [{ name: 'id', type: PropertyType.uuid, nullable: false, readonly: true }],
      computedProperties: [],
      relations: [
        {
          name: 'author',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'Author',
          mappedNamespace: 'public',
          mappedProperty: 'posts',
          nullable: false
        }
      ],
      indexes: []
    });
    const postMeta = generator.getMetadata('Post', 'public')!;

    const project = new Project();
    const file: SourceFile = project.createSourceFile('Post.d.ts');
    generateEntityDefinition(generator, postMeta, file);

    const content = file.getText();
    // InitData 应包含 authorId（非 nullable 的 UUID）
    expect(content).toMatch(/interface PostInitData[\s\S]*?authorId\?:\s*UUID[\s\S]*?}/);
    const initDataBlock = content.match(/interface PostInitData\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    expect(initDataBlock).not.toContain('| null');
  });

  it('MANY_TO_ONE：nullable 时外键类型应为 UUID | null', () => {
    const generator = new RxDBClientGenerator();
    addSimpleEntity(generator, 'Department');
    generator.addEntity({
      name: 'Employee',
      namespace: 'public',
      displayName: 'Employee',
      repository: 'Repository',
      extends: ['EntityBase'],
      properties: [{ name: 'id', type: PropertyType.uuid, nullable: false, readonly: true }],
      computedProperties: [],
      relations: [
        {
          name: 'department',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'Department',
          mappedNamespace: 'public',
          mappedProperty: 'employees',
          nullable: true
        }
      ],
      indexes: []
    });
    const meta = generator.getMetadata('Employee', 'public')!;

    const project = new Project();
    const file: SourceFile = project.createSourceFile('Employee.d.ts');
    generateEntityDefinition(generator, meta, file);

    const content = file.getText();
    expect(content).toMatch(/interface EmployeeInitData[\s\S]*?departmentId\?:\s*UUID \| null[\s\S]*?}/);
  });

  it('ONE_TO_ONE（当前实体持有外键）：外键 xxxId 应出现在 InitData 中', () => {
    const generator = new RxDBClientGenerator();
    addSimpleEntity(generator, 'User');
    generator.addEntity({
      name: 'Profile',
      namespace: 'public',
      displayName: 'Profile',
      repository: 'Repository',
      extends: ['EntityBase'],
      properties: [{ name: 'id', type: PropertyType.uuid, nullable: false, readonly: true }],
      computedProperties: [],
      relations: [
        {
          name: 'user',
          kind: RelationKind.ONE_TO_ONE,
          mappedEntity: 'User',
          mappedNamespace: 'public',
          mappedProperty: 'profile',
          nullable: false
        }
      ],
      indexes: []
    });
    const meta = generator.getMetadata('Profile', 'public')!;

    const project = new Project();
    const file: SourceFile = project.createSourceFile('Profile.d.ts');
    generateEntityDefinition(generator, meta, file);

    const content = file.getText();
    expect(content).toMatch(/interface ProfileInitData[\s\S]*?userId\?:\s*UUID[\s\S]*?}/);
  });

  it('ONE_TO_MANY：InitData 中不应出现任何关系字段', () => {
    const generator = new RxDBClientGenerator();
    addSimpleEntity(generator, 'Post');
    generator.addEntity({
      name: 'Author',
      namespace: 'public',
      displayName: 'Author',
      repository: 'Repository',
      extends: ['EntityBase'],
      properties: [{ name: 'id', type: PropertyType.uuid, nullable: false, readonly: true }],
      computedProperties: [],
      relations: [
        {
          name: 'posts',
          kind: RelationKind.ONE_TO_MANY,
          mappedEntity: 'Post',
          mappedNamespace: 'public',
          mappedProperty: 'author'
        }
      ],
      indexes: []
    });
    const meta = generator.getMetadata('Author', 'public')!;

    const project = new Project();
    const file: SourceFile = project.createSourceFile('Author.d.ts');
    generateEntityDefinition(generator, meta, file);

    const content = file.getText();
    // InitData 只有基础属性（id），不应注入 postsId 或集合属性
    const initDataBlock = content.match(/interface AuthorInitData\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    expect(initDataBlock).not.toContain('postsId');
    expect(initDataBlock).not.toContain('posts$');
  });
});

describe('generator_entity_relations — generated consumer types', () => {
  it('ONE_TO_MANY uses the related entity constructor type', async () => {
    const generator = new RxDBClientGenerator();
    generator.addEntity({
      name: 'Author',
      namespace: 'public',
      displayName: 'Author',
      repository: 'Repository',
      extends: ['EntityBase'],
      properties: [],
      computedProperties: [],
      relations: [
        {
          name: 'posts',
          kind: RelationKind.ONE_TO_MANY,
          mappedEntity: 'Post',
          mappedNamespace: 'public',
          mappedProperty: 'author'
        }
      ],
      indexes: []
    });
    generator.addEntity({
      name: 'Post',
      namespace: 'public',
      displayName: 'Post',
      repository: 'Repository',
      extends: ['EntityBase'],
      properties: [],
      computedProperties: [],
      relations: [
        {
          name: 'author',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'Author',
          mappedNamespace: 'public',
          mappedProperty: 'posts',
          nullable: false
        }
      ],
      indexes: []
    });

    generator.exec();

    const declaration = generator.getSourceFiles().find(file => file.getFilePath() === 'index.d.ts')!;
    expect(declaration.getText()).toContain('RelationEntitiesObservable<typeof Post>');
    await expect(
      compileGeneratedConsumer(
        generator.getSourceFiles(),
        "import { Author } from './generated/index.js';\ndeclare const author: Author;\nauthor.posts$;"
      )
    ).resolves.toEqual([]);
  });

  it('MANY_TO_MANY uses the related entity constructor type', async () => {
    const generator = new RxDBClientGenerator();
    generator.addEntity({
      name: 'Student',
      namespace: 'public',
      displayName: 'Student',
      repository: 'Repository',
      extends: ['EntityBase'],
      properties: [],
      computedProperties: [],
      relations: [
        {
          name: 'courses',
          kind: RelationKind.MANY_TO_MANY,
          mappedEntity: 'Course',
          mappedNamespace: 'public',
          mappedProperty: 'students'
        }
      ],
      indexes: []
    });
    generator.addEntity({
      name: 'Course',
      namespace: 'public',
      displayName: 'Course',
      repository: 'Repository',
      extends: ['EntityBase'],
      properties: [],
      computedProperties: [],
      relations: [
        {
          name: 'students',
          kind: RelationKind.MANY_TO_MANY,
          mappedEntity: 'Student',
          mappedNamespace: 'public',
          mappedProperty: 'courses'
        }
      ],
      indexes: []
    });

    generator.exec();

    const declaration = generator.getSourceFiles().find(file => file.getFilePath() === 'index.d.ts')!;
    expect(declaration.getText()).toContain('RelationEntitiesObservable<typeof Course>');
    await expect(
      compileGeneratedConsumer(
        generator.getSourceFiles(),
        "import { Student } from './generated/index.js';\ndeclare const student: Student;\nstudent.courses$;"
      )
    ).resolves.toEqual([]);
  });

  it('escapes multiline relation display names in generated JSDoc', async () => {
    const unsafeDisplayName = 'safe*/\nexport declare const injected: true;';
    const generator = new RxDBClientGenerator();
    generator.addEntity({
      name: 'Author',
      namespace: 'public',
      displayName: 'Author',
      repository: 'Repository',
      extends: ['EntityBase'],
      properties: [],
      computedProperties: [],
      relations: [
        {
          name: 'posts',
          displayName: unsafeDisplayName,
          kind: RelationKind.ONE_TO_MANY,
          mappedEntity: 'Post',
          mappedNamespace: 'public',
          mappedProperty: 'author'
        }
      ],
      indexes: []
    });
    generator.addEntity({
      name: 'Post',
      namespace: 'public',
      displayName: 'Post',
      repository: 'Repository',
      extends: ['EntityBase'],
      properties: [],
      computedProperties: [],
      relations: [
        {
          name: 'author',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'Author',
          mappedNamespace: 'public',
          mappedProperty: 'posts',
          nullable: false
        }
      ],
      indexes: []
    });

    generator.exec();

    const declaration = generator.getSourceFiles().find(file => file.getFilePath() === 'index.d.ts');
    expect(declaration?.getText()).toContain(' * safe*\\/');
    expect(declaration?.getText()).toContain(' * export declare const injected: true;');
    await expect(
      compileGeneratedConsumer(
        generator.getSourceFiles(),
        "import { Author } from './generated/index.js';\ndeclare const author: Author;\nauthor.posts$;"
      )
    ).resolves.toEqual([]);
  });
});
