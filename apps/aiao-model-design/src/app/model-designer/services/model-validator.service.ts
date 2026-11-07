import type { DesignEntity, DesignProperty, DesignRelation } from '../models/index.js';
import { Injectable } from '@angular/core';
import {
  ENTITY_NAME_PATTERN,
  INVERSE_RELATION_KIND,
  PROPERTY_NAME_PATTERN,
  TABLE_NAME_PATTERN,
  type RelationKind
} from '../constants';
import type { ModelValidationResult, ValidationResult } from '../interfaces/designer.interface';
import { resolveTableName } from '../sql';

const RESERVED_WORDS = new Set(['id', 'constructor', 'prototype', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy']);

/**
 * 模型验证服务
 *
 * 验证实体名、属性名以及整体模型的合法性。
 */
@Injectable()
export class ModelValidatorService {
  /** 验证实体名称（PascalCase + 唯一性） */
  validateEntityName(name: string, existingNames: string[]): ValidationResult {
    const errors: string[] = [];
    if (!name.trim()) {
      errors.push('validation.entityNameRequired');
    } else if (!ENTITY_NAME_PATTERN.test(name)) {
      errors.push('validation.entityNameMustBePascalCase');
    }
    if (existingNames.includes(name)) {
      errors.push('validation.entityNameAlreadyExists');
    }
    return { valid: errors.length === 0, errors };
  }

  /** 验证实体逻辑名称及最终 SQL 表名的格式和唯一性 */
  validateEntityIdentity(entity: DesignEntity, siblingEntities: DesignEntity[]): ValidationResult {
    const errors = this.validateEntityName(
      entity.name,
      siblingEntities.map(item => item.name)
    ).errors;
    const explicitTableName = entity.tableName?.trim();
    if (explicitTableName && !TABLE_NAME_PATTERN.test(explicitTableName)) {
      errors.push('validation.tableNameInvalid');
    }
    const tableName = resolveTableName(entity);
    const tableNameExists = siblingEntities.some(item => resolveTableName(item) === tableName);
    if (tableNameExists) errors.push('validation.tableNameAlreadyExists');
    return { valid: errors.length === 0, errors };
  }

  /** 验证属性名称（camelCase + 保留字 + 唯一性） */
  validatePropertyName(name: string, existingNames: string[]): ValidationResult {
    const errors: string[] = [];
    if (!name.trim()) {
      errors.push('validation.propertyNameRequired');
    } else if (!PROPERTY_NAME_PATTERN.test(name)) {
      errors.push('validation.propertyNameMustBeCamelCase');
    }
    if (RESERVED_WORDS.has(name)) {
      errors.push('validation.propertyNameReservedWord');
    }
    if (existingNames.includes(name)) {
      errors.push('validation.propertyNameAlreadyExists');
    }
    return { valid: errors.length === 0, errors };
  }

  /** 验证子属性名称（camelCase + 同级唯一性） */
  validateChildPropertyName(name: string, siblingNames: string[]): ValidationResult {
    const errors: string[] = [];
    if (!name.trim()) {
      errors.push('validation.propertyNameRequired');
    } else if (!PROPERTY_NAME_PATTERN.test(name)) {
      errors.push('validation.propertyNameMustBeCamelCase');
    }
    if (siblingNames.includes(name)) {
      errors.push('validation.childPropertyNameAlreadyExists');
    }
    return { valid: errors.length === 0, errors };
  }

  /** 全量验证模型设计（实体名、属性名、关系合法性） */
  validateModel(
    entities: DesignEntity[],
    properties: Map<string, DesignProperty[]>,
    relations: Map<string, DesignRelation[]>,
    childProperties?: Map<string, DesignProperty[]>
  ): ModelValidationResult {
    const entityErrors = new Map<string, string[]>();
    const propertyErrors = new Map<string, string[]>();
    const relationErrors = new Map<string, string[]>();
    const globalErrors: string[] = [];

    const allRelations = [...relations.values()].flat();
    const entityNameMap: Map<string, string> = new Map(entities.map(e => [e.id, e.name]));

    for (const entity of entities) {
      const siblings = entities.filter(item => item.id !== entity.id);
      const errs = this.validateEntityIdentity(entity, siblings).errors;
      const props = properties.get(entity.id) ?? [];
      if (props.length === 0) {
        errs.push('validation.entityMustHaveAtLeastOneProperty');
      }
      if (errs.length > 0) entityErrors.set(entity.id, errs);

      this.#validateProperties(props, childProperties, propertyErrors);

      const rels = relations.get(entity.id) ?? [];
      const relNames = new Set<string>();
      for (const rel of rels) {
        const relErrs = this.#validateRelation(rel, entity, entities, allRelations, entityNameMap, relNames);
        relNames.add(rel.name);
        if (relErrs.length > 0) relationErrors.set(rel.id, relErrs);
      }
    }

    const valid =
      entityErrors.size === 0 && propertyErrors.size === 0 && relationErrors.size === 0 && globalErrors.length === 0;
    return { valid, entityErrors, propertyErrors, relationErrors, globalErrors };
  }

  #validateProperties(
    props: DesignProperty[],
    childProperties: Map<string, DesignProperty[]> | undefined,
    propertyErrors: Map<string, string[]>
  ): void {
    const names = props.map(p => p.name);

    for (const prop of props) {
      const errs: string[] = [];

      if (!PROPERTY_NAME_PATTERN.test(prop.name)) {
        errs.push('validation.propertyNameMustBeCamelCase');
      }
      if (names.filter(n => n === prop.name).length > 1) {
        errs.push('validation.propertyNameAlreadyExists');
      }

      if (prop.propertyType === 'keyValue' && childProperties) {
        const children = childProperties.get(prop.id) ?? [];
        const childNames = children.map(c => c.name);
        for (const child of children) {
          const childErrs: string[] = [];
          if (!PROPERTY_NAME_PATTERN.test(child.name)) {
            childErrs.push('validation.propertyNameMustBeCamelCase');
          }
          if (childNames.filter(n => n === child.name).length > 1) {
            childErrs.push('validation.childPropertyNameAlreadyExists');
          }
          if (childErrs.length > 0) {
            propertyErrors.set(child.id, childErrs);
            if (!errs.includes('validation.childPropertyInvalid')) {
              errs.push('validation.childPropertyInvalid');
            }
          }
        }
      }

      if (errs.length > 0) propertyErrors.set(prop.id, errs);
    }
  }

  #validateRelation(
    rel: DesignRelation,
    entity: DesignEntity,
    entities: DesignEntity[],
    allRelations: DesignRelation[],
    entityNameMap: Map<string, string>,
    relNames: Set<string>
  ): string[] {
    const errs: string[] = [];
    const targetEntity = rel.mappedEntityId != null ? entities.find(e => e.id === rel.mappedEntityId) : null;

    if (rel.mappedEntityId == null) {
      errs.push('validation.relationMustSpecifyMappedEntityId');
    } else if (!targetEntity) {
      errs.push('validation.targetEntityDoesNotExist');
    }

    if (!rel.mappedPropertyId) {
      errs.push('validation.relationMustSpecifyMappedPropertyId');
    }

    if (relNames.has(rel.name)) {
      errs.push('validation.relationNameDuplicated');
    }

    const inverseKind = INVERSE_RELATION_KIND[rel.relationKind as RelationKind];
    if (!inverseKind || !targetEntity) return errs;

    const isSelfInverse =
      rel.mappedEntityId === entity.id && inverseKind === rel.relationKind && rel.mappedPropertyId === rel.id;
    const hasInverse = allRelations.some(
      r =>
        r.id !== rel.id &&
        r.designEntityId === rel.mappedEntityId &&
        r.mappedEntityId === entity.id &&
        r.relationKind === inverseKind
    );
    if (!hasInverse && !isSelfInverse) {
      errs.push('validation.missingInverseRelation');
    }

    return errs;
  }
}
