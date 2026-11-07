vi.mock('@aiao/rxdb-plugin-tree', () => vi.importMock('@aiao/rxdb'));

import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@aiao/rxdb', () => ({
  RxDB: class {},
  Entity: () => (target: unknown) => target,
  EntityBase: class {},
  PropertyType: { string: 'string', number: 'number', integer: 'integer', boolean: 'boolean' },
  RelationKind: {
    ONE_TO_ONE: 'ONE_TO_ONE',
    ONE_TO_MANY: 'ONE_TO_MANY',
    MANY_TO_ONE: 'MANY_TO_ONE',
    MANY_TO_MANY: 'MANY_TO_MANY'
  },
  OnDeleteAction: { CASCADE: 'CASCADE', SET_NULL: 'SET_NULL' },
  OnUpdateAction: { CASCADE: 'CASCADE' },
  ENTITY_BASE_METADATA_OPTIONS: { properties: [], computedProperties: [], relations: [] },
  TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS: { properties: [], computedProperties: [], relations: [] }
}));

const mockGeneratorState = vi.hoisted(() => ({
  addEntityCalls: [] as unknown[],
  execCalled: false,
  sourceFiles: [] as Array<{ getFilePath: () => string; getText: () => string }>,
  shouldThrow: false,
  throwMessage: ''
}));

vi.mock('@aiao/rxdb-client-generator', () => ({
  RxDBClientGenerator: class {
    addEntity(opts: unknown) {
      mockGeneratorState.addEntityCalls.push(opts);
    }
    exec() {
      mockGeneratorState.execCalled = true;
      if (mockGeneratorState.shouldThrow) throw new Error(mockGeneratorState.throwMessage);
    }
    getSourceFiles() {
      return mockGeneratorState.sourceFiles;
    }
  }
}));

vi.mock('fflate', () => ({
  zipSync: vi.fn(() => new Uint8Array([80, 75, 3, 4]))
}));

import type { DesignEntity, DesignIndex, DesignProperty, DesignRelation } from '../../models/index.js';
import type { KeyValuePropertyMetadata } from '@aiao/rxdb';
import { CodeGeneratorService } from '../../services/code-generator.service';
import { ModelValidatorService } from '../../services/model-validator.service';

describe('CodeGeneratorService', () => {
  let service: CodeGeneratorService;

  const makeEntity = (id: string, name: string): DesignEntity =>
    ({
      id,
      name,
      displayName: null,
      entityNamespace: null,
      extendsBase: 'EntityBase',
      repositoryType: 'Repository',
      nodeX: 0,
      nodeY: 0,
      nodeWidth: 240,
      sortOrder: 'a0'
    }) as unknown as DesignEntity;

  const makeProp = (id: string, name: string, type: DesignProperty['propertyType'], sortOrder = 'a0'): DesignProperty =>
    ({
      id,
      name,
      propertyType: type,
      isNullable: false,
      isUnique: false,
      isRequired: false,
      isReadonly: false,
      isSortable: false,
      defaultValue: null,
      columnName: null,
      displayName: null,
      sortOrder,
      designEntityId: 'e1'
    }) as unknown as DesignProperty;

  const makeRelation = (id: string, name: string, kind: string, targetId: string, sortOrder = 'a0'): DesignRelation =>
    ({
      id,
      name,
      relationKind: kind,
      mappedEntityId: targetId,
      mappedPropertyId: null,
      mappedNamespace: null,
      columnName: null,
      onDeleteAction: null,
      onUpdateAction: null,
      sortOrder,
      designEntityId: 'e1'
    }) as unknown as DesignRelation;

  const makeEntityFull = (id: string, name: string, overrides: Partial<Record<string, unknown>> = {}): DesignEntity =>
    ({
      id,
      name,
      displayName: null,
      entityNamespace: null,
      tableName: null,
      extendsBase: 'EntityBase',
      repositoryType: 'Repository',
      nodeX: 0,
      nodeY: 0,
      nodeWidth: 240,
      sortOrder: 'a0',
      ...overrides
    }) as unknown as DesignEntity;

  const makeIndex = (id: string, props: string[], isUnique = false, sortOrder = 'a0'): DesignIndex =>
    ({ id, propertyIds: props, isUnique, sortOrder, designEntityId: 'e1' }) as unknown as DesignIndex;

  beforeEach(() => {
    mockGeneratorState.addEntityCalls = [];
    mockGeneratorState.execCalled = false;
    mockGeneratorState.sourceFiles = [];
    mockGeneratorState.shouldThrow = false;
    mockGeneratorState.throwMessage = '';

    TestBed.configureTestingModule({
      providers: [CodeGeneratorService, ModelValidatorService]
    });

    service = TestBed.inject(CodeGeneratorService);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('MUST be defined', () => {
    expect(service).toBeDefined();
  });

  describe('toMetadataOptions', () => {
    it('MUST convert entity with properties sorted by sortOrder', () => {
      const entity = makeEntity('e1', 'User');
      const props = [makeProp('p1', 'email', 'string', 'a1'), makeProp('p2', 'name', 'string', 'a0')];

      const result = service.toMetadataOptions(entity, props, [], [], [entity]);
      expect(result.name).toBe('User');
      expect(result.properties?.[0]?.name).toBe('name');
      expect(result.properties?.[1]?.name).toBe('email');
    });

    it('MUST handle entity with tableName', () => {
      const entity = makeEntityFull('e1', 'User', { tableName: 'users' });
      const result = service.toMetadataOptions(entity, [], [], [], [entity]);
      expect(result.tableName).toBe('users');
    });

    it('MUST handle entity with displayName', () => {
      const entity = makeEntityFull('e1', 'User', { displayName: 'User Entity' });
      const result = service.toMetadataOptions(entity, [], [], [], [entity]);
      expect(result.displayName).toBe('User Entity');
    });

    it('MUST handle entity with entityNamespace', () => {
      const entity = makeEntityFull('e1', 'User', { entityNamespace: 'Core' });
      const result = service.toMetadataOptions(entity, [], [], [], [entity]);
      expect(result.namespace).toBe('core');
    });

    it('MUST handle property with defaultValue (valid JSON)', () => {
      const prop = {
        ...makeProp('p1', 'count', 'number'),
        defaultValue: '42'
      } as unknown as DesignProperty;
      const entity = makeEntity('e1', 'User');
      const result = service.toMetadataOptions(entity, [prop], [], [], [entity]);
      expect(result.properties?.[0]?.default).toBe(42);
    });

    it('MUST handle property with defaultValue (invalid JSON - returns raw string)', () => {
      const prop = {
        ...makeProp('p1', 'label', 'string'),
        defaultValue: 'hello world'
      } as unknown as DesignProperty;
      const entity = makeEntity('e1', 'User');
      const result = service.toMetadataOptions(entity, [prop], [], [], [entity]);
      expect(result.properties?.[0]?.default).toBe('hello world');
    });

    it('MUST handle keyValue property with childPropertiesMap', () => {
      const parent = {
        ...makeProp('p1', 'config', 'keyValue'),
        isRequired: false
      } as unknown as DesignProperty;
      const child1 = {
        ...makeProp('c1', 'host', 'string', 'a0'),
        displayName: 'Host',
        isNullable: false,
        isRequired: true,
        defaultValue: null
      } as unknown as DesignProperty;
      const child2 = {
        ...makeProp('c2', 'port', 'number', 'a1'),
        displayName: null,
        isNullable: true,
        isRequired: false,
        defaultValue: '8080'
      } as unknown as DesignProperty;

      const childMap = new Map([['p1', [child1, child2]]]);
      const entity = makeEntity('e1', 'User');
      const result = service.toMetadataOptions(entity, [parent], [], [], [entity], childMap);

      const kvProp = result.properties?.[0] as { type: unknown; properties: KeyValuePropertyMetadata[] } | undefined;
      expect(kvProp?.type).toBe('keyValue');
      expect(kvProp?.properties).toHaveLength(2);
      expect(kvProp?.properties[0]?.name).toBe('host');
      expect(kvProp?.properties[0]?.required).toBe(true);
      expect(kvProp?.properties[1]?.name).toBe('port');
      expect(kvProp?.properties[1]?.default).toBe(8080);
    });

    it('MUST handle relation with mappedNamespace', () => {
      const rel = {
        ...makeRelation('r1', 'posts', 'ONE_TO_MANY', 'e2'),
        mappedNamespace: 'Blog'
      } as unknown as DesignRelation;
      const entity = makeEntity('e1', 'User');
      const targetEntity = makeEntity('e2', 'Post');
      const result = service.toMetadataOptions(entity, [], [rel], [], [entity, targetEntity]);
      expect(result.relations?.[0]?.mappedNamespace).toBe('blog');
    });

    it('MUST handle relation with onDeleteAction and onUpdateAction', () => {
      const rel = {
        ...makeRelation('r1', 'posts', 'ONE_TO_MANY', 'e2'),
        onDeleteAction: 'CASCADE',
        onUpdateAction: 'CASCADE'
      } as unknown as DesignRelation;
      const entity = makeEntity('e1', 'User');
      const targetEntity = makeEntity('e2', 'Post');
      const result = service.toMetadataOptions(entity, [], [rel], [], [entity, targetEntity]);
      expect(result.relations?.[0]?.onDelete).toBe('CASCADE');
      expect(result.relations?.[0]?.onUpdate).toBe('CASCADE');
    });

    it('MUST convert relations sorted by sortOrder', () => {
      const entity = makeEntity('e1', 'User');
      const targetEntity1 = makeEntity('e2', 'Post');
      const targetEntity2 = makeEntity('e3', 'Profile');
      const rels = [
        makeRelation('r1', 'posts', 'ONE_TO_MANY', 'e2', 'a1'),
        makeRelation('r2', 'profile', 'ONE_TO_ONE', 'e3', 'a0')
      ];

      const result = service.toMetadataOptions(entity, [], rels, [], [entity, targetEntity1, targetEntity2]);
      expect(result.relations?.[0]?.name).toBe('profile');
      expect(result.relations?.[1]?.name).toBe('posts');
    });

    it('MUST convert indexes sorted by sortOrder', () => {
      const entity = makeEntity('e1', 'User');
      const idxs = [makeIndex('i1', ['email'], true, 'a1'), makeIndex('i2', ['name'], false, 'a0')];

      const result = service.toMetadataOptions(entity, [], [], idxs, [entity]);
      expect(result.indexes?.[0]?.properties).toEqual(['name']);
      expect(result.indexes?.[1]?.properties).toEqual(['email']);
      expect(result.indexes?.[1]?.unique).toBe(true);
    });
  });

  describe('toAllMetadataOptions', () => {
    it('MUST convert multiple entities', () => {
      const entities = [makeEntity('e1', 'User'), makeEntity('e2', 'Post')];
      const propsMap = new Map([
        ['e1', [makeProp('p1', 'name', 'string')]],
        ['e2', [makeProp('p2', 'title', 'string')]]
      ]);

      const result = service.toAllMetadataOptions(entities, propsMap, new Map(), new Map());
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('User');
      expect(result[1].name).toBe('Post');
    });
  });

  describe('generate', () => {
    it('MUST return success with generated files', () => {
      mockGeneratorState.sourceFiles = [
        { getFilePath: () => '/index.js', getText: () => 'export {}' },
        { getFilePath: () => '/index.d.ts', getText: () => 'export {}' }
      ];

      const result = service.generate([]);
      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(2);
      expect(result.files[0].path).toBe('/index.js');
    });

    it('MUST return failure on error', () => {
      mockGeneratorState.shouldThrow = true;
      mockGeneratorState.throwMessage = 'Invalid entity';

      const result = service.generate([]);
      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid entity');
    });
  });

  describe('downloadZip', () => {
    it('MUST create zip and trigger download', () => {
      const createObjectURL = vi.fn(() => 'blob:test');
      const revokeObjectURL = vi.fn();
      const clickSpy = vi.fn();
      const appendChildSpy = vi.fn();
      const removeChildSpy = vi.fn();

      globalThis.URL.createObjectURL = createObjectURL;
      globalThis.URL.revokeObjectURL = revokeObjectURL;

      const origCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') {
          const el = origCreateElement('a');
          el.click = clickSpy;
          return el;
        }
        return origCreateElement(tag);
      });
      vi.spyOn(document.body, 'appendChild').mockImplementation(appendChildSpy);
      vi.spyOn(document.body, 'removeChild').mockImplementation(removeChildSpy);

      service.downloadZip([{ path: 'index.js', content: 'export {}' }], 'test-model');

      expect(createObjectURL).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalled();
    });
  });
});
