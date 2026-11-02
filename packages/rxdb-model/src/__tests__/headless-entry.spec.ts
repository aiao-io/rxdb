import { PropertyType, type EntityMetadata, type EntityPropertyMetadata } from '@aiao/rxdb';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as headless from '../headless.js';

/** 只含字段推导与能力派生读取的元数据，足以在 Node 里走完消费方的接入路径。 */
const articleMetadata = (properties: EntityPropertyMetadata[]): EntityMetadata =>
  ({
    name: 'Article',
    namespace: 'public',
    displayName: 'Article',
    propertyMap: new Map(properties.map(property => [property.name, property])),
    computedPropertyMap: new Map(),
    foreignKeyRelationMap: new Map(),
    relationMap: new Map(),
    relations: [],
    properties,
    isForeignKey: () => false
  }) as unknown as EntityMetadata;

describe('@aiao/rxdb-model/headless entry', () => {
  it('查询构建器的字段推导、操作符、输入类型、能力与文案无需根入口即可取得', () => {
    const metadata = articleMetadata([
      { name: 'title', type: PropertyType.string, columnName: 'title', nullable: false, displayName: '标题' },
      { name: 'views', type: PropertyType.integer, columnName: 'views', nullable: true }
    ]);

    const fields = headless.createSchemaFromEntity(metadata);
    expect(fields.map(field => field.name)).toEqual(expect.arrayContaining(['title', 'views']));

    const title = fields.find(field => field.name === 'title');
    expect(title).toBeDefined();
    const operators = headless.getDefaultOperatorRegistry().getForField(title!);
    expect(operators.map(operator => operator.key)).toContain('contains');
    const builtIn = operators.find(operator => operator.labelKey !== undefined);
    expect(headless.modelText(builtIn!.labelKey!)).toBe(builtIn!.label);
    expect(headless.getInputType('number', '>=')).toBe('number');
    expect(headless.getDefaultValueForType('number')).toBeNull();
    expect(headless.modelMessages.map(catalog => catalog.namespace)).toContain('rxdb-model');
    expect(headless.modelEnMessages['text.127ad2bc86']).toBe('{p0} is required');
    expect(headless.deriveEntityCapabilities(metadata)).toEqual({ canCreate: true, canEdit: true, canDelete: true });

    const builder = headless.createQueryBuilderController({ fields });
    builder.addRule(null, { field: 'title', operator: 'contains', value: 'headless' });
    expect(builder.snapshot.valid).toBe(true);
    expect(builder.toRxDBQuery()).toEqual({
      combinator: 'and',
      rules: [{ field: 'title', operator: 'contains', value: 'headless' }]
    });
  });

  it('在 Node 环境导入时不初始化 DOM 或 VTable', () => {
    expect(typeof document).toBe('undefined');
    expect(headless.createEntityFormController).toBeTypeOf('function');
    expect(headless.createQueryBuilderController).toBeTypeOf('function');
    expect(headless.createEntityListController).toBeTypeOf('function');
    expect(headless.createEntityDetailController).toBeTypeOf('function');
    expect(headless.createEntityDialogController).toBeTypeOf('function');
    expect(headless.createQueryTableController).toBeTypeOf('function');
  });

  it('包 manifest 将 VTable 声明为可选 peer 并发布独立子路径', () => {
    const packageJsonPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      exports?: Record<string, unknown>;
      peerDependenciesMeta?: Record<string, { optional?: boolean }>;
    };
    expect(packageJson.exports?.['./headless']).toBeDefined();
    expect(packageJson.peerDependenciesMeta?.['@visactor/vtable']?.optional).toBe(true);
    expect(packageJson.peerDependenciesMeta?.['@visactor/vtable-editors']?.optional).toBe(true);
  });

  it('三端 headless 子路径映射到可执行构建产物，Angular secondary entry 使用包根配置', () => {
    const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
    type Manifest = {
      exports?: Record<string, string | Record<string, string>>;
      peerDependenciesMeta?: Record<string, { optional?: boolean }>;
      lib?: { entryFile?: string };
    };
    const readManifest = (relativePath: string): Manifest =>
      JSON.parse(readFileSync(resolve(workspaceRoot, relativePath), 'utf8')) as Manifest;
    const assertHeadlessExport = (relativePath: string): void => {
      const manifest = readManifest(relativePath);
      const entry = manifest.exports?.['./headless'];
      expect(entry).toBeDefined();
      expect(typeof entry).toBe('object');
      if (!entry || typeof entry === 'string') return;
      expect(entry['@aiao/source']).toMatch(/\.ts$/);
      expect(entry.types).toMatch(/\.d\.ts$/);
      expect(entry.import ?? entry.default).toMatch(/\.js$/);
      expect(manifest.peerDependenciesMeta?.['@visactor/vtable']?.optional).toBe(true);
    };

    assertHeadlessExport('packages/rxdb-model/package.json');
    assertHeadlessExport('packages/rxdb-model-react/package.json');
    assertHeadlessExport('packages/rxdb-model-vue/package.json');

    const angularManifest = readManifest('packages/rxdb-model-angular/package.json');
    expect(angularManifest.exports?.['.']).toBeUndefined();
    const angularHeadless = angularManifest.exports?.['./headless'];
    expect(typeof angularHeadless).toBe('object');
    if (!angularHeadless || typeof angularHeadless === 'string') return;
    expect(angularHeadless['@aiao/source']).toBe('./src/headless/public-api.ts');
    expect(readManifest('packages/rxdb-model-angular/headless/ng-package.json').lib?.entryFile).toBe(
      '../src/headless/public-api.ts'
    );
    expect(() =>
      readFileSync(resolve(workspaceRoot, 'packages/rxdb-model-angular/src/headless/package.json'))
    ).toThrow();
    expect(() =>
      readFileSync(resolve(workspaceRoot, 'packages/rxdb-model-angular/src/headless/ng-package.json'))
    ).toThrow();
  });
});
