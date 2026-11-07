import type { EntityMetadataOptions } from '@aiao/rxdb';
import type { GeneratedFile, ModelValidationResult } from './interfaces/designer.interface';
import type { DesignEntity, DesignRelation } from './models/index.js';
import type { CodeGeneratorService } from './services/code-generator.service';

/** 翻译带参数的错误消息 */
export function translateError(
  key: string,
  translations: Record<string, unknown>,
  params?: Record<string, string>
): string {
  const keys = key.split('.');
  let value: unknown = translations;
  for (const k of keys) {
    value = (value as Record<string, unknown>)?.[k];
  }
  if (typeof value !== 'string') return key;
  if (params) {
    return value.replace(/\{(\w+)\}/g, (_, k: string) => params[k] ?? `{${k}}`);
  }
  return value;
}

/** 将 ModelValidation 错误格式化为可显示的字符串数组 */
export function formatValidationErrors(
  validation: {
    globalErrors: string[];
    entityErrors: Map<string, string[]>;
    propertyErrors: Map<string, string[]>;
    relationErrors: Map<string, string[]>;
  },
  entities: DesignEntity[],
  allRelations: DesignRelation[],
  translations: Record<string, unknown>
): string[] {
  const entityNameMap = new Map<string, string>(entities.map(e => [e.id, e.name]));
  const relNameMap = new Map<string, string>(
    allRelations.map(r => [r.id, `${entityNameMap.get(r.designEntityId) ?? '?'}.${r.name}`])
  );
  const relTargetMap = new Map<string, string | undefined>(
    allRelations.map(r => [r.id, r.mappedEntityId ?? undefined])
  );

  const errors: string[] = [...validation.globalErrors];

  validation.entityErrors.forEach((errs, id) => {
    const name = entityNameMap.get(id) ?? id;
    errors.push(...errs.map(e => `${name}: ${translateError(e, translations, { name })}`));
  });

  validation.propertyErrors.forEach((errs, id) => {
    errors.push(...errs.map(e => `property(${id}): ${translateError(e, translations)}`));
  });

  validation.relationErrors.forEach((errs, id) => {
    const name = relNameMap.get(id) ?? id;
    const targetId = relTargetMap.get(id);
    const target = targetId ? (entityNameMap.get(targetId) ?? targetId) : undefined;
    const rel = allRelations.find(r => r.id === id);
    const params = { name: rel?.name ?? '', id: targetId ?? '', target: target ?? '' };
    errors.push(...errs.map(e => `${name}: ${translateError(e, translations, params)}`));
  });

  return errors;
}

/**
 * 执行代码生成或返回验证错误
 *
 * 如果模型验证失败，返回格式化后的错误列表；
 * 如果验证通过，调用代码生成器返回生成的文件。
 */
export function generateOrGetErrors(
  validation: ModelValidationResult,
  codeGenerator: CodeGeneratorService,
  entities: DesignEntity[],
  allRelations: DesignRelation[],
  translations: Record<string, unknown>,
  metadataOptions: EntityMetadataOptions[]
): { files: GeneratedFile[]; errors: string[] } {
  if (!validation.valid) {
    return {
      files: [],
      errors: formatValidationErrors(validation, entities, allRelations, translations)
    };
  }
  const result = codeGenerator.generate(metadataOptions);
  return { files: result.files, errors: result.errors };
}
