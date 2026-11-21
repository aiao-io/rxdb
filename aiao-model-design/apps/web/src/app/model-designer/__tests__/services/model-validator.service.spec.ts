import { describe, expect, it } from 'vitest';
import type { DesignEntity, DesignProperty, DesignRelation } from '../../models/index.js';
import { ModelValidatorService } from '../../services/model-validator.service';

describe('ModelValidatorService', () => {
  const service = new ModelValidatorService();

  describe('validateEntityName', () => {
    it('MUST accept valid PascalCase name', () => {
      const result = service.validateEntityName('UserProfile', []);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('MUST reject empty name', () => {
      const result = service.validateEntityName('', []);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('validation.entityNameRequired');
    });

    it('MUST reject non-PascalCase name', () => {
      const result = service.validateEntityName('userProfile', []);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('validation.entityNameMustBePascalCase');
    });

    it('MUST reject duplicate name', () => {
      const result = service.validateEntityName('User', ['User', 'Order']);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('validation.entityNameAlreadyExists');
    });
  });

  describe('validatePropertyName', () => {
    it('MUST accept valid camelCase name', () => {
      const result = service.validatePropertyName('firstName', []);
      expect(result.valid).toBe(true);
    });

    it('MUST reject empty name', () => {
      const result = service.validatePropertyName('  ', []);
      expect(result.valid).toBe(false);
    });

    it('MUST reject non-camelCase name', () => {
      const result = service.validatePropertyName('FirstName', []);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('validation.propertyNameMustBeCamelCase');
    });

    it('MUST reject reserved word "id"', () => {
      const result = service.validatePropertyName('id', []);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('validation.propertyNameReservedWord');
    });

    it('MUST reject reserved word "constructor"', () => {
      const result = service.validatePropertyName('constructor', []);
      expect(result.valid).toBe(false);
    });

    it('MUST reject duplicate name', () => {
      const result = service.validatePropertyName('name', ['name', 'age']);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('validation.propertyNameAlreadyExists');
    });
  });

  describe('validateChildPropertyName', () => {
    it('MUST accept valid unique child name', () => {
      const result = service.validateChildPropertyName('host', ['port', 'timeout']);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('MUST reject empty child name', () => {
      const result = service.validateChildPropertyName('', []);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('validation.propertyNameRequired');
    });

    it('MUST reject non-camelCase child name', () => {
      const result = service.validateChildPropertyName('Host', []);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('validation.propertyNameMustBeCamelCase');
    });

    it('MUST reject duplicate sibling name', () => {
      const result = service.validateChildPropertyName('host', ['host', 'port']);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('validation.childPropertyNameAlreadyExists');
    });
  });

  describe('validateModel', () => {
    const makeEntity = (id: string, name: string, tableName?: string): DesignEntity =>
      ({ id, name, tableName }) as DesignEntity;

    const makeProperty = (id: string, name: string, propertyType = 'string'): DesignProperty =>
      ({ id, name, propertyType }) as DesignProperty;

    const makeRelation = (
      id: string,
      name: string,
      kind: string,
      targetId: string,
      entityId: string,
      mapped?: string
    ): DesignRelation =>
      ({
        id,
        name,
        relationKind: kind,
        mappedEntityId: targetId,
        designEntityId: entityId,
        mappedPropertyId: mapped ?? null
      }) as DesignRelation;

    it('MUST pass valid model', () => {
      const entities = [makeEntity('e1', 'User')];
      const properties = new Map([['e1', [makeProperty('p1', 'name')]]]);
      const relations = new Map<string, DesignRelation[]>();
      const result = service.validateModel(entities, properties, relations);
      expect(result.valid).toBe(true);
    });

    it('MUST fail entity with no properties', () => {
      const entities = [makeEntity('e1', 'User')];
      const properties = new Map<string, DesignProperty[]>();
      const relations = new Map<string, DesignRelation[]>();
      const result = service.validateModel(entities, properties, relations);
      expect(result.valid).toBe(false);
      expect(result.entityErrors.get('e1')).toContain('validation.entityMustHaveAtLeastOneProperty');
    });

    it('MUST validate entity names during full-model validation', () => {
      const entities = [makeEntity('e1', 'invalidName')];
      const properties = new Map([['e1', [makeProperty('p1', 'name')]]]);

      const result = service.validateModel(entities, properties, new Map());

      expect(result.entityErrors.get('e1')).toContain('validation.entityNameMustBePascalCase');
    });

    it('MUST reject duplicate entity names', () => {
      const entities = [makeEntity('e1', 'User'), makeEntity('e2', 'User')];
      const properties = new Map([
        ['e1', [makeProperty('p1', 'name')]],
        ['e2', [makeProperty('p2', 'email')]]
      ]);

      const result = service.validateModel(entities, properties, new Map());

      expect(result.entityErrors.get('e1')).toContain('validation.entityNameAlreadyExists');
      expect(result.entityErrors.get('e2')).toContain('validation.entityNameAlreadyExists');
    });

    it('MUST reject duplicate resolved SQL table names', () => {
      const entities = [makeEntity('e1', 'UserProfile'), makeEntity('e2', 'Account', 'user_profile')];
      const properties = new Map([
        ['e1', [makeProperty('p1', 'name')]],
        ['e2', [makeProperty('p2', 'email')]]
      ]);

      const result = service.validateModel(entities, properties, new Map());

      expect(result.entityErrors.get('e1')).toContain('validation.tableNameAlreadyExists');
      expect(result.entityErrors.get('e2')).toContain('validation.tableNameAlreadyExists');
    });

    it('MUST reject an invalid explicit SQL table name', () => {
      const entities = [makeEntity('e1', 'User', 'invalid-table')];
      const properties = new Map([['e1', [makeProperty('p1', 'name')]]]);

      const result = service.validateModel(entities, properties, new Map());

      expect(result.entityErrors.get('e1')).toContain('validation.tableNameInvalid');
    });

    it('MUST fail relation with non-existent target entity', () => {
      const entities = [makeEntity('e1', 'User')];
      const properties = new Map([['e1', [makeProperty('p1', 'name')]]]);
      const relations = new Map([['e1', [makeRelation('r1', 'orders', 'ONE_TO_MANY', 'NonExistent', 'e1', 'owner')]]]);
      const result = service.validateModel(entities, properties, relations);
      expect(result.valid).toBe(false);
      expect(result.relationErrors.get('r1')).toContain('validation.targetEntityDoesNotExist');
    });

    it('MUST fail relation without mappedPropertyId', () => {
      const entities = [makeEntity('e1', 'User'), makeEntity('e2', 'Order')];
      const properties = new Map([
        ['e1', [makeProperty('p1', 'name')]],
        ['e2', [makeProperty('p2', 'number')]]
      ]);
      const relations = new Map([
        ['e1', [makeRelation('r1', 'orders', 'ONE_TO_MANY', 'e2', 'e1')]],
        ['e2', [makeRelation('r2', 'user', 'MANY_TO_ONE', 'e1', 'e2', 'orders')]]
      ]);
      const result = service.validateModel(entities, properties, relations);
      expect(result.valid).toBe(false);
      expect(result.relationErrors.get('r1')).toContain('validation.relationMustSpecifyMappedPropertyId');
    });

    it('MUST fail duplicate relation names within same entity', () => {
      const entities = [makeEntity('e1', 'User'), makeEntity('e2', 'Order')];
      const properties = new Map([
        ['e1', [makeProperty('p1', 'name')]],
        ['e2', [makeProperty('p2', 'number')]]
      ]);
      const relations = new Map([
        [
          'e1',
          [
            makeRelation('r1', 'orders', 'ONE_TO_MANY', 'e2', 'e1', 'owner'),
            makeRelation('r2', 'orders', 'MANY_TO_ONE', 'e2', 'e1', 'owner')
          ]
        ],
        ['e2', [makeRelation('r3', 'user', 'MANY_TO_ONE', 'e1', 'e2', 'orders')]]
      ]);
      const result = service.validateModel(entities, properties, relations);
      expect(result.valid).toBe(false);
      expect(result.relationErrors.get('r2')).toContain('validation.relationNameDuplicated');
    });

    it('MUST fail when inverse relation is missing', () => {
      const entities = [makeEntity('e1', 'User'), makeEntity('e2', 'Post')];
      const properties = new Map([
        ['e1', [makeProperty('p1', 'name')]],
        ['e2', [makeProperty('p2', 'title')]]
      ]);
      const relations = new Map([['e1', [makeRelation('r1', 'posts', 'ONE_TO_MANY', 'e2', 'e1', 'user')]]]);
      const result = service.validateModel(entities, properties, relations);
      expect(result.valid).toBe(false);
      expect(result.relationErrors.get('r1')).toContain('validation.missingInverseRelation');
    });

    it('MUST pass when both sides of relation exist', () => {
      const entities = [makeEntity('e1', 'User'), makeEntity('e2', 'Post')];
      const properties = new Map([
        ['e1', [makeProperty('p1', 'name')]],
        ['e2', [makeProperty('p2', 'title')]]
      ]);
      const relations = new Map([
        ['e1', [makeRelation('r1', 'posts', 'ONE_TO_MANY', 'e2', 'e1', 'user')]],
        ['e2', [makeRelation('r2', 'user', 'MANY_TO_ONE', 'e1', 'e2', 'posts')]]
      ]);
      const result = service.validateModel(entities, properties, relations);
      expect(result.relationErrors.has('r1')).toBe(false);
      expect(result.relationErrors.has('r2')).toBe(false);
    });

    it('MUST allow ONE_TO_ONE self relation mapped to itself', () => {
      const entities = [makeEntity('e1', 'User')];
      const properties = new Map([['e1', [makeProperty('p1', 'name')]]]);
      const relations = new Map([['e1', [makeRelation('r1', 'spouse', 'ONE_TO_ONE', 'e1', 'e1', 'r1')]]]);

      const result = service.validateModel(entities, properties, relations);

      expect(result.relationErrors.has('r1')).toBe(false);
      expect(result.valid).toBe(true);
    });

    it('MUST fail property with invalid name pattern', () => {
      const entities = [makeEntity('e1', 'User')];
      const properties = new Map([['e1', [makeProperty('p1', 'InvalidName')]]]);
      const relations = new Map<string, DesignRelation[]>();
      const result = service.validateModel(entities, properties, relations);
      expect(result.propertyErrors.get('p1')).toContain('validation.propertyNameMustBeCamelCase');
    });

    it('MUST fail duplicate property names', () => {
      const entities = [makeEntity('e1', 'User')];
      const properties = new Map([['e1', [makeProperty('p1', 'name'), makeProperty('p2', 'name')]]]);
      const relations = new Map<string, DesignRelation[]>();
      const result = service.validateModel(entities, properties, relations);
      expect(result.propertyErrors.get('p1')).toContain('validation.propertyNameAlreadyExists');
      expect(result.propertyErrors.get('p2')).toContain('validation.propertyNameAlreadyExists');
    });

    it('MUST bubble child property error to parent keyValue property', () => {
      const entities = [makeEntity('e1', 'User')];
      const parent = makeProperty('p1', 'settings', 'keyValue');
      const child = makeProperty('c1', 'InvalidChild', 'string');
      const properties = new Map([['e1', [parent]]]);
      const childProperties = new Map([['p1', [child]]]);
      const relations = new Map<string, DesignRelation[]>();
      const result = service.validateModel(entities, properties, relations, childProperties);
      expect(result.propertyErrors.get('c1')).toContain('validation.propertyNameMustBeCamelCase');
      expect(result.propertyErrors.get('p1')).toContain('validation.childPropertyInvalid');
    });

    it('MUST bubble duplicate child names to parent keyValue property', () => {
      const entities = [makeEntity('e1', 'User')];
      const parent = makeProperty('p1', 'config', 'keyValue');
      const child1 = makeProperty('c1', 'host', 'string');
      const child2 = makeProperty('c2', 'host', 'string');
      const properties = new Map([['e1', [parent]]]);
      const childProperties = new Map([['p1', [child1, child2]]]);
      const relations = new Map<string, DesignRelation[]>();
      const result = service.validateModel(entities, properties, relations, childProperties);
      expect(result.propertyErrors.get('c1')).toContain('validation.childPropertyNameAlreadyExists');
      expect(result.propertyErrors.get('p1')).toContain('validation.childPropertyInvalid');
    });

    it('MUST fail relation when mappedEntityId is null', () => {
      const entities = [makeEntity('e1', 'User')];
      const properties = new Map([['e1', [makeProperty('p1', 'name')]]]);
      const relations = new Map([
        ['e1', [makeRelation('r1', 'thing', 'ONE_TO_MANY', null as unknown as string, 'e1', 'other')]]
      ]);
      const result = service.validateModel(entities, properties, relations);
      expect(result.valid).toBe(false);
      expect(result.relationErrors.get('r1')).toContain('validation.relationMustSpecifyMappedEntityId');
    });

    it('MUST pass valid properties with childProperties', () => {
      const entities = [makeEntity('e1', 'User')];
      const parent = makeProperty('p1', 'config', 'keyValue');
      const child1 = makeProperty('c1', 'host', 'string');
      const child2 = makeProperty('c2', 'port', 'number');
      const properties = new Map([['e1', [parent]]]);
      const childProperties = new Map([['p1', [child1, child2]]]);
      const relations = new Map<string, DesignRelation[]>();
      const result = service.validateModel(entities, properties, relations, childProperties);
      expect(result.propertyErrors.size).toBe(0);
    });
  });
});
