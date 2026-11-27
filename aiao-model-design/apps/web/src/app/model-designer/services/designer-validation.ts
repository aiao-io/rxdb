import { computed, type Signal } from '@angular/core';
import type { RelationFieldError, RelationFieldErrors } from '../interfaces/designer.interface';
import type { DesignEntity, DesignProperty, DesignRelation } from '../models/index.js';
import type { ModelValidatorService } from './model-validator.service';

/**
 * 创建模型验证相关的 computed signals
 *
 * @param validator - 验证服务
 * @param entities - 实体列表信号
 * @param propertiesMap - 属性映射信号
 * @param relationsMap - 关系映射信号
 * @param childPropertiesMap - 子属性映射信号
 */
export function createValidationSignals(
  validator: ModelValidatorService,
  entities: Signal<DesignEntity[]>,
  propertiesMap: Signal<Map<string, DesignProperty[]>>,
  relationsMap: Signal<Map<string, DesignRelation[]>>,
  childPropertiesMap: Signal<Map<string, DesignProperty[]>>
) {
  const modelValidation = computed(() =>
    validator.validateModel(entities(), propertiesMap(), relationsMap(), childPropertiesMap())
  );

  const invalidRelationIds = computed(() => new Set<string>(modelValidation().relationErrors.keys()));
  const invalidPropertyIds = computed(() => new Set<string>(modelValidation().propertyErrors.keys()));

  const missingInverseRelationIds = computed(() => {
    const ids = new Set<string>();
    modelValidation().relationErrors.forEach((errors, relId) => {
      if (errors.includes('validation.missingInverseRelation')) ids.add(relId);
    });
    return ids;
  });

  const relationFieldErrors = computed((): RelationFieldErrors => {
    const fieldErrors = new Map<string, Set<RelationFieldError>>();
    modelValidation().relationErrors.forEach((errors, relId) => {
      const fields = new Set<RelationFieldError>();
      for (const err of errors) {
        if (err === 'validation.relationNameDuplicated') fields.add('name');
        else if (
          err === 'validation.relationMustSpecifyMappedEntityId' ||
          err === 'validation.targetEntityDoesNotExist'
        )
          fields.add('mappedEntityId');
        else if (err === 'validation.relationMustSpecifyMappedPropertyId') fields.add('mappedPropertyId');
      }
      if (fields.size > 0) fieldErrors.set(relId, fields);
    });
    return fieldErrors;
  });

  return { modelValidation, invalidRelationIds, invalidPropertyIds, missingInverseRelationIds, relationFieldErrors };
}
