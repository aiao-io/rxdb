import type { DesignEntity, DesignRelation } from '../models/index.js';
import type { EntityMetadataOptions } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { formatValidationErrors, generateOrGetErrors, translateError } from '../designer-generate';
import type { CodeGeneratorService } from '../services/code-generator.service';

describe('translateError', () => {
  const translations: Record<string, unknown> = {
    validation: {
      entityNameEmpty: '实体名称不能为空',
      entityNameDuplicated: '实体名称 {name} 已存在',
      deep: { nested: { key: '嵌套 {value}' } }
    }
  };

  it('按 key 路径查找翻译', () => {
    expect(translateError('validation.entityNameEmpty', translations)).toBe('实体名称不能为空');
  });

  it('替换参数占位符', () => {
    expect(translateError('validation.entityNameDuplicated', translations, { name: 'User' })).toBe(
      '实体名称 User 已存在'
    );
  });

  it('嵌套路径查找', () => {
    expect(translateError('validation.deep.nested.key', translations, { value: 'OK' })).toBe('嵌套 OK');
  });

  it('key 不存在时返回原始 key', () => {
    expect(translateError('validation.notExist', translations)).toBe('validation.notExist');
  });

  it('路径中间为空时返回原始 key', () => {
    expect(translateError('validation.entityNameEmpty.extra', translations)).toBe('validation.entityNameEmpty.extra');
  });

  it('参数缺失时保留占位符', () => {
    expect(translateError('validation.entityNameDuplicated', translations, {})).toBe('实体名称 {name} 已存在');
  });
});

describe('formatValidationErrors', () => {
  const translations: Record<string, unknown> = {
    validation: {
      entityNameDuplicated: '实体名称 {name} 已存在',
      propertyError: '属性错误',
      relationMissing: '关系 {name} 缺少目标 {target}'
    }
  };

  it('包含 globalErrors', () => {
    const validation = {
      globalErrors: ['全局错误1'],
      entityErrors: new Map<string, string[]>(),
      propertyErrors: new Map<string, string[]>(),
      relationErrors: new Map<string, string[]>()
    };

    const errors = formatValidationErrors(validation, [], [], translations);
    expect(errors).toEqual(['全局错误1']);
  });

  it('格式化 entityErrors', () => {
    const entities = [{ id: 'e1', name: 'User' }] as unknown as DesignEntity[];
    const validation = {
      globalErrors: [],
      entityErrors: new Map([['e1', ['validation.entityNameDuplicated']]]),
      propertyErrors: new Map<string, string[]>(),
      relationErrors: new Map<string, string[]>()
    };

    const errors = formatValidationErrors(validation, entities, [], translations);
    expect(errors).toEqual(['User: 实体名称 User 已存在']);
  });

  it('格式化 propertyErrors', () => {
    const validation = {
      globalErrors: [],
      entityErrors: new Map<string, string[]>(),
      propertyErrors: new Map([['p1', ['validation.propertyError']]]),
      relationErrors: new Map<string, string[]>()
    };

    const errors = formatValidationErrors(validation, [], [], translations);
    expect(errors).toEqual(['property(p1): 属性错误']);
  });

  it('格式化 relationErrors 带目标实体', () => {
    const entities = [
      { id: 'e1', name: 'User' },
      { id: 'e2', name: 'Post' }
    ] as unknown as DesignEntity[];
    const relations = [
      { id: 'r1', name: 'posts', designEntityId: 'e1', mappedEntityId: 'e2' }
    ] as unknown as DesignRelation[];
    const validation = {
      globalErrors: [],
      entityErrors: new Map<string, string[]>(),
      propertyErrors: new Map<string, string[]>(),
      relationErrors: new Map([['r1', ['validation.relationMissing']]])
    };

    const errors = formatValidationErrors(validation, entities, relations, translations);
    expect(errors).toEqual(['User.posts: 关系 posts 缺少目标 Post']);
  });

  it('entity 未找到时用 id 替代', () => {
    const validation = {
      globalErrors: [],
      entityErrors: new Map([['unknown-id', ['validation.entityNameDuplicated']]]),
      propertyErrors: new Map<string, string[]>(),
      relationErrors: new Map<string, string[]>()
    };

    const errors = formatValidationErrors(validation, [], [], translations);
    expect(errors).toEqual(['unknown-id: 实体名称 unknown-id 已存在']);
  });
});

describe('generateOrGetErrors', () => {
  it('验证失败时返回格式化错误', () => {
    const validation = {
      valid: false,
      globalErrors: ['model is empty'],
      entityErrors: new Map<string, string[]>(),
      propertyErrors: new Map<string, string[]>(),
      relationErrors: new Map<string, string[]>()
    };
    const codeGenerator = { generate: vi.fn() } as unknown as CodeGeneratorService;

    const result = generateOrGetErrors(validation, codeGenerator, [], [], {}, []);
    expect(result.files).toEqual([]);
    expect(result.errors).toEqual(['model is empty']);
    expect(codeGenerator.generate).not.toHaveBeenCalled();
  });

  it('验证通过时调用代码生成', () => {
    const validation = {
      valid: true,
      globalErrors: [],
      entityErrors: new Map<string, string[]>(),
      propertyErrors: new Map<string, string[]>(),
      relationErrors: new Map<string, string[]>()
    };
    const files = [{ path: 'user.ts', content: 'export class User {}' }];
    const codeGenerator = {
      generate: vi.fn(() => ({ files, errors: [] }))
    } as unknown as CodeGeneratorService;
    const metadataOptions = [{ name: 'User' }] as unknown as EntityMetadataOptions[];

    const result = generateOrGetErrors(validation, codeGenerator, [], [], {}, metadataOptions);
    expect(result.files).toEqual(files);
    expect(result.errors).toEqual([]);
    expect(codeGenerator.generate).toHaveBeenCalledWith(metadataOptions);
  });

  it('代码生成有错误时返回错误', () => {
    const validation = {
      valid: true,
      globalErrors: [],
      entityErrors: new Map<string, string[]>(),
      propertyErrors: new Map<string, string[]>(),
      relationErrors: new Map<string, string[]>()
    };
    const codeGenerator = {
      generate: vi.fn(() => ({ files: [], errors: ['gen error'] }))
    } as unknown as CodeGeneratorService;

    const result = generateOrGetErrors(validation, codeGenerator, [], [], {}, []);
    expect(result.errors).toEqual(['gen error']);
  });
});
