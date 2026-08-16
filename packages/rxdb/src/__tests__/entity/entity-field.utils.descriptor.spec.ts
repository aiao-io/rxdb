/**
 * @fileoverview US-012 阶段 B — AC#13～26 字段描述契约。
 *
 * 覆盖 `describeEntityFields()` 的输出形状与 `parseEntityFieldsDescriptor()` 的
 * 键策略（D6.1）。冻结层的回归由 `entity-field.utils.baseline.spec.ts` 单独把关，
 * 本文件不碰旧导出。
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  describeEntityFields,
  ENTITY_FIELDS_DTO_VERSION,
  EntityRelationResolutionError,
  parseEntityFieldsDescriptor,
  type EntityFieldDescriptor,
  type EntityFieldsDescriptor,
  type EntityRelationFieldDescriptor,
  type EntityToManyRelationFieldDescriptor
} from '../../entity/entity-field.utils.js';
import { validateEntityMetadata } from '../../entity/metadata-validate.js';
import { RxDBError } from '../../RxDBError.js';
import {
  ARTICLE_METADATA,
  createFieldResolver,
  CROSS_NAMESPACE_METADATA,
  FIELD_RESOLVER,
  FLAG_MATRIX_METADATA,
  GHOST_HOST_METADATA,
  MUTABLE_SYSTEM_METADATA,
  ORDER_METADATA,
  ORDER_REVERSED_METADATA,
  ORPHAN_HOST_METADATA,
  SEMANTIC_METADATA,
  STAMP_HOST_METADATA,
  TOPIC_METADATA
} from '../fixtures/field-descriptor-entities.js';

/** 解析器用例操作的是「任意 JSON」，刻意不带 DTO 类型，否则构造不出非法组合。 */
interface LooseDto {
  [key: string]: unknown;
  fields: Record<string, unknown>[];
}

const ARTICLE = describeEntityFields(ARTICLE_METADATA, FIELD_RESOLVER);
const SEMANTIC = describeEntityFields(SEMANTIC_METADATA, FIELD_RESOLVER);
const FLAGS = describeEntityFields(FLAG_MATRIX_METADATA, FIELD_RESOLVER);

/** 取指定字段；取不到直接失败，避免可选链把断言变成空跑。 */
function fieldOf(dto: EntityFieldsDescriptor, name: string): EntityFieldDescriptor {
  const found = dto.fields.find(item => item.field === name);
  if (!found) throw new Error(`字段 ${name} 不存在`);
  return found;
}

/** 键存在性视图：AC#21 要求断言键在不在，`toEqual` 区分不了「省略」和「值是 undefined」。 */
const viewOf = (descriptor: EntityFieldDescriptor): Record<string, unknown> =>
  descriptor as unknown as Record<string, unknown>;

/** 深拷贝成可随意改写的 JSON，用于喂给解析器。 */
const clone = (dto: EntityFieldsDescriptor): LooseDto => JSON.parse(JSON.stringify(dto)) as LooseDto;

/** 取 LooseDto 里的字段记录。 */
function looseField(dto: LooseDto, name: string): Record<string, unknown> {
  const found = dto.fields.find(item => item['field'] === name);
  if (!found) throw new Error(`字段 ${name} 不存在`);
  return found;
}

/** 把 `unknown` 值当嵌套对象继续改写。 */
const nested = (record: Record<string, unknown>, key: string): Record<string, unknown> =>
  record[key] as Record<string, unknown>;

/** 绕开静态类型往 DTO 副本上塞非法值。 */
const looseSet = (record: object, key: string, value: unknown): void => {
  (record as Record<string, unknown>)[key] = value;
};

/** 在 DTO 副本上做一次改写并返回副本，用于表驱动的畸形输入。 */
function mutate(dto: EntityFieldsDescriptor, apply: (draft: LooseDto) => void): LooseDto {
  const draft = clone(dto);
  apply(draft);
  return draft;
}

/** 捕获异常对象本身；没抛就是用例失败。 */
function captureError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('预期抛错，但调用正常返回了');
}

/** 递归收集所有嵌套值与键名。 */
function collect(value: unknown, values: unknown[], keys: string[]): void {
  values.push(value);
  if (Array.isArray(value)) {
    value.forEach(item => collect(item, values, keys));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  Object.entries(value).forEach(([key, item]) => {
    keys.push(key);
    collect(item, values, keys);
  });
}

describe('AC#13～15 — format / enum / options 的原样透传', () => {
  it('AC#13 — richText 保留 contentType，不做净化', () => {
    const body = fieldOf(SEMANTIC, 'body');

    expect(body.valueType).toBe('string');
    expect(body.format).toStrictEqual({ kind: 'richText', contentType: 'text/markdown' });
  });

  it('AC#14 — enum 保持声明顺序，options 保留 label / color / disabled', () => {
    const state = fieldOf(SEMANTIC, 'state');

    // 声明序是 review → draft → published，字母序会排成 draft → published → review
    expect(state.enum).toStrictEqual(['review', 'draft', 'published']);
    expect(state.options).toStrictEqual({
      review: { label: '待审', color: '#f5a623' },
      draft: { label: '草稿' },
      published: { label: '已发布', disabled: true }
    });
    expect(state.format).toStrictEqual({ kind: 'singleSelect' });
  });

  it('AC#15 — date 属性配 dateTime 语义，输出不含 Date 实例', () => {
    const publishedAt = fieldOf(SEMANTIC, 'publishedAt');
    const values: unknown[] = [];
    collect(SEMANTIC, values, []);

    expect(publishedAt.valueType).toBe('date');
    expect(publishedAt.format).toStrictEqual({
      kind: 'dateTime',
      timezone: 'Asia/Shanghai',
      display: 'datetime'
    });
    expect(values.some(value => value instanceof Date)).toBe(false);
  });
});

describe('AC#16～19 — 关系字段', () => {
  it('AC#16 — 四种关系以关系名成字段，外键列不单独出现', () => {
    const names = ARTICLE.fields.map(item => item.field);

    expect(names).toContain('draftRevision');
    expect(names).toContain('author');
    expect(names).toContain('comments');
    expect(names).toContain('topics');
    ['draftRevisionId', 'authorId', 'commentsId', 'topicsId'].forEach(name => expect(names).not.toContain(name));
  });

  it('AC#16 — 1:1 / m:1 是单值，带 writeField 与 set-remove', () => {
    const draft = fieldOf(ARTICLE, 'draftRevision');
    const author = fieldOf(ARTICLE, 'author');

    expect(draft.cardinality).toBe('single');
    expect(draft.relation).toStrictEqual({
      kind: '1:1',
      entity: 'Revision',
      namespace: 'public',
      mutation: 'set-remove',
      writeField: 'draftRevisionId'
    });
    expect(author.cardinality).toBe('single');
    expect(author.relation).toStrictEqual({
      kind: 'm:1',
      entity: 'Author',
      namespace: 'public',
      mutation: 'set-remove',
      writeField: 'authorId'
    });
  });

  it('AC#16 — 1:m / m:n 是多值，只有 add-remove，没有 writeField', () => {
    const comments = fieldOf(ARTICLE, 'comments');
    const topics = fieldOf(ARTICLE, 'topics');

    expect(comments.cardinality).toBe('multiple');
    expect(comments.relation).toStrictEqual({
      kind: '1:m',
      entity: 'Comment',
      namespace: 'public',
      mutation: 'add-remove'
    });
    expect(topics.cardinality).toBe('multiple');
    expect(topics.relation).toStrictEqual({
      kind: 'm:n',
      entity: 'Topic',
      namespace: 'public',
      mutation: 'add-remove'
    });
  });

  it('AC#16 — 关系恒 readonly: true 且不带 format', () => {
    ['draftRevision', 'author', 'comments', 'topics'].forEach(name => {
      const view = viewOf(fieldOf(ARTICLE, name));
      expect(view['source']).toBe('relation');
      expect(view['readonly']).toBe(true);
      expect('format' in view).toBe(false);
    });
  });

  it('AC#16 — 类型层：多值关系写不进 nullable', () => {
    const build = (): EntityToManyRelationFieldDescriptor => ({
      field: 'comments',
      displayName: '评论',
      source: 'relation',
      cardinality: 'multiple',
      valueType: 'uuid',
      readonly: true,
      sortable: false,
      // @ts-expect-error 1:m / m:n 不承载 nullable（INV-5）
      nullable: false,
      relation: { kind: '1:m', entity: 'Comment', namespace: 'public', mutation: 'add-remove' }
    });

    expect(build().cardinality).toBe('multiple');
  });

  it('AC#16 — 类型层：多值关系写不进 writeField', () => {
    const build = (): EntityToManyRelationFieldDescriptor => ({
      field: 'topics',
      displayName: '话题',
      source: 'relation',
      cardinality: 'multiple',
      valueType: 'string',
      readonly: true,
      sortable: false,
      relation: {
        kind: 'm:n',
        entity: 'Topic',
        namespace: 'public',
        mutation: 'add-remove',
        // @ts-expect-error 多值关系没有可写外键列（D9）
        writeField: 'topicsId'
      }
    });

    expect(build().relation.kind).toBe('m:n');
  });

  it('AC#16 — 类型层：顶层 cardinality 收窄后单值键是必选', () => {
    const narrow = (descriptor: EntityRelationFieldDescriptor): boolean => {
      if (descriptor.cardinality !== 'single') throw new Error('用例只喂单值关系');
      expectTypeOf(descriptor.nullable).toEqualTypeOf<boolean>();
      expectTypeOf(descriptor.relation.writeField).toEqualTypeOf<string>();
      return descriptor.nullable;
    };
    const author = fieldOf(ARTICLE, 'author');
    if (author.source !== 'relation') throw new Error('author 必须是关系字段');

    expect(narrow(author)).toBe(true);
  });

  it('AC#17① — 类型层：省略 resolve 无法编译', () => {
    const call = (): EntityFieldsDescriptor =>
      // @ts-expect-error resolve 是必填参数（D7），不存在「不传就猜」的重载
      describeEntityFields(TOPIC_METADATA);

    expect(typeof call).toBe('function');
  });

  it('AC#17② — 目标未注册直接抛错，不回退 uuid', () => {
    const error = captureError(() => describeEntityFields(ORPHAN_HOST_METADATA, createFieldResolver([])));

    expect(error).toBeInstanceOf(RxDBError);
    expect((error as Error).message).toContain('ref');
    expect((error as Error).message).toContain('Nowhere');
    expect((error as Error).message).not.toContain('uuid');
  });

  it('AC#16 — relation.namespace 跟随 mappedNamespace', () => {
    const cross = describeEntityFields(CROSS_NAMESPACE_METADATA, FIELD_RESOLVER);

    expect(fieldOf(cross, 'remote').relation).toStrictEqual({
      kind: 'm:1',
      entity: 'Target',
      namespace: 'other',
      mutation: 'set-remove',
      writeField: 'remoteId'
    });
  });

  it('AC#18 — 关系值类型跟随目标主键类型', () => {
    // Topic 主键是 slug: string，Revision / Author / Comment 主键是 uuid
    expect(fieldOf(ARTICLE, 'topics').valueType).toBe('string');
    expect(fieldOf(ARTICLE, 'draftRevision').valueType).toBe('uuid');
    expect(fieldOf(ARTICLE, 'author').valueType).toBe('uuid');
    expect(fieldOf(ARTICLE, 'comments').valueType).toBe('uuid');
  });

  it('AC#19 — 目标缺主键：抛 EntityRelationResolutionError 并带上完整 details', () => {
    const error = captureError(() => describeEntityFields(GHOST_HOST_METADATA, FIELD_RESOLVER));

    expect(error).toBeInstanceOf(EntityRelationResolutionError);
    expect(error).toBeInstanceOf(RxDBError);
    expect((error as EntityRelationResolutionError).details).toStrictEqual({
      namespace: 'public',
      entity: 'GhostHost',
      field: 'ref',
      rule: 'missingRelationPrimary'
    });
  });

  it('AC#19 — 目标主键类型不受支持：rule 为 unsupportedRelationValueType', () => {
    const error = captureError(() => describeEntityFields(STAMP_HOST_METADATA, FIELD_RESOLVER));

    expect(error).toBeInstanceOf(EntityRelationResolutionError);
    expect(error).toBeInstanceOf(RxDBError);
    expect((error as EntityRelationResolutionError).details).toStrictEqual({
      namespace: 'public',
      entity: 'StampHost',
      field: 'ref',
      rule: 'unsupportedRelationValueType'
    });
  });
});

describe('AC#20～22 — 计算属性、系统字段与布尔标志', () => {
  it('AC#20 — 计算属性输出真实 valueType 且恒只读', () => {
    const excerpt = fieldOf(ARTICLE, 'excerpt');

    expect(excerpt.source).toBe('computed');
    expect(excerpt.valueType).toBe('string');
    expect(excerpt.readonly).toBe(true);
  });

  it('AC#20 — 系统字段 source 为 system，createdBy / updatedBy 是 string', () => {
    const ids = ['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'];

    ids.forEach(name => expect(fieldOf(ARTICLE, name).source).toBe('system'));
    expect(fieldOf(ARTICLE, 'createdBy').valueType).toBe('string');
    expect(fieldOf(ARTICLE, 'updatedBy').valueType).toBe('string');
  });

  it('AC#20 — 系统字段的 readonly 读元数据，不是填死的常量', () => {
    const loose = describeEntityFields(MUTABLE_SYSTEM_METADATA, FIELD_RESOLVER);
    const createdAt = fieldOf(loose, 'createdAt');

    expect(createdAt.source).toBe('system');
    expect(createdAt.readonly).toBe(false);
    expect(fieldOf(ARTICLE, 'createdAt').readonly).toBe(true);
  });

  it('AC#21 — 属性行恒输出五个语义标志且都是 false', () => {
    const flags = ['readonly', 'nullable', 'required', 'unique', 'encrypted'];

    ['text', 'count', 'blob', 'raw', 'kv'].forEach(name => {
      const view = viewOf(fieldOf(FLAGS, name));
      flags.forEach(flag => expect([name, flag, flag in view, view[flag]]).toStrictEqual([name, flag, true, false]));
    });
  });

  it('AC#21 — sortable / searchable / primary 按接口能力决定键在不在', () => {
    const matrix = [
      ['text', true, true, true],
      ['count', true, false, false],
      ['blob', false, false, false],
      ['raw', false, false, false],
      ['kv', false, false, false]
    ] as const;

    matrix.forEach(([name, sortable, searchable, primary]) => {
      const view = viewOf(fieldOf(FLAGS, name));
      expect([name, 'sortable' in view, 'searchable' in view, 'primary' in view]).toStrictEqual([
        name,
        sortable,
        searchable,
        primary
      ]);
    });
  });

  it('AC#21 — 计算属性行同样恒输出五个标志，readonly 是 true', () => {
    const view = viewOf(fieldOf(FLAGS, 'derived'));

    ['nullable', 'required', 'unique', 'encrypted'].forEach(flag => {
      expect([flag, flag in view, view[flag]]).toStrictEqual([flag, true, false]);
    });
    expect(view['readonly']).toBe(true);
  });

  it('AC#21 — keyValue 属性带 keyValueSchema，其余属性不带', () => {
    expect('keyValueSchema' in viewOf(fieldOf(FLAGS, 'kv'))).toBe(true);
    ['text', 'count', 'blob', 'raw'].forEach(name =>
      expect('keyValueSchema' in viewOf(fieldOf(FLAGS, name))).toBe(false)
    );
  });

  it('AC#21 — 关系行恒有 sortable，属性维度键一个都不出现', () => {
    const absent = ['searchable', 'primary', 'enum', 'options', 'keyValueSchema'];

    ['one', 'many', 'children', 'peers'].forEach(name => {
      const view = viewOf(fieldOf(FLAGS, name));
      expect([name, 'sortable' in view, view['sortable'], view['readonly']]).toStrictEqual([name, true, false, true]);
      absent.forEach(key => expect([name, key, key in view]).toStrictEqual([name, key, false]));
    });
  });

  it('AC#21 — nullable / required / unique / encrypted 只在 1:1 / m:1 出现', () => {
    const single = ['nullable', 'required', 'unique', 'encrypted'];

    ['one', 'many'].forEach(name => {
      const view = viewOf(fieldOf(FLAGS, name));
      single.forEach(key => expect([name, key, key in view, view[key]]).toStrictEqual([name, key, true, false]));
    });
    ['children', 'peers'].forEach(name => {
      const view = viewOf(fieldOf(FLAGS, name));
      single.forEach(key => expect([name, key, key in view]).toStrictEqual([name, key, false]));
    });
  });

  it('AC#22① — core 注册期不拦 encrypted + sortable，DTO 忠实输出两者', () => {
    const secret = viewOf(fieldOf(ARTICLE, 'secret'));

    expect(validateEntityMetadata(ARTICLE_METADATA)).toStrictEqual([]);
    expect(secret['encrypted']).toBe(true);
    expect(secret['sortable']).toBe(true);
  });
});

describe('AC#23～24 — DTO 往返与解析器键策略', () => {
  it('AC#23 — JSON 往返后深比较无损', () => {
    const roundTrip = parseEntityFieldsDescriptor(JSON.parse(JSON.stringify(ARTICLE)));

    expect(roundTrip).toStrictEqual(ARTICLE);
    expect(roundTrip.dtoVersion).toBe(ENTITY_FIELDS_DTO_VERSION);
  });

  it('AC#23 — 输出不含 Map / 函数 / Date / Uint8Array / columnName / default', () => {
    const values: unknown[] = [];
    const keys: string[] = [];
    collect(ARTICLE, values, keys);

    expect(values.some(value => value instanceof Map)).toBe(false);
    expect(values.some(value => typeof value === 'function')).toBe(false);
    expect(values.some(value => value instanceof Date)).toBe(false);
    expect(values.some(value => value instanceof Uint8Array)).toBe(false);
    expect(keys).not.toContain('columnName');
    expect(keys).not.toContain('default');
  });

  it('AC#24 — 各层未知键被丢弃，不出现在返回值里', () => {
    const input = clone(SEMANTIC);
    input['extraTop'] = 1;
    const state = looseField(input, 'state');
    state['extraField'] = 1;
    nested(state, 'format')['extraFormat'] = 1;
    nested(nested(state, 'options'), 'draft')['extraDisplay'] = 1;

    const parsed = parseEntityFieldsDescriptor(input);
    const parsedState = viewOf(fieldOf(parsed, 'state'));

    expect('extraTop' in parsed).toBe(false);
    expect('extraField' in parsedState).toBe(false);
    expect(parsedState['format']).toStrictEqual({ kind: 'singleSelect' });
    expect(parsedState['options']).toStrictEqual(fieldOf(SEMANTIC, 'state').options);
  });

  it('AC#24 — 关系层与 keyValueSchema 条目层的未知键同样被丢弃', () => {
    const input = clone(ARTICLE);
    nested(looseField(input, 'author'), 'relation')['extraRelation'] = 1;
    nested(nested(looseField(input, 'meta'), 'keyValueSchema'), 'source')['extraEntry'] = 1;

    const parsed = parseEntityFieldsDescriptor(input);

    expect(fieldOf(parsed, 'author').relation).toStrictEqual(fieldOf(ARTICLE, 'author').relation);
    expect(viewOf(fieldOf(parsed, 'meta'))['keyValueSchema']).toStrictEqual(
      viewOf(fieldOf(ARTICLE, 'meta'))['keyValueSchema']
    );
  });

  it('AC#24 — 跨 format 的陌生配置键只被删除，不报错（D6.1）', () => {
    const input = clone(SEMANTIC);
    const body = nested(looseField(input, 'body'), 'format');
    body['currency'] = 'CNY';
    body['min'] = 1;
    nested(looseField(input, 'homepage'), 'format')['unit'] = 'ms';

    const parsed = parseEntityFieldsDescriptor(input);

    expect(fieldOf(parsed, 'body').format).toStrictEqual({ kind: 'richText', contentType: 'text/markdown' });
    expect(fieldOf(parsed, 'homepage').format).toStrictEqual({ kind: 'url', schemes: ['https'] });
  });

  it('AC#24 — format 缺必填配置键显式失败（D6.1 的「已知键缺失」半边）', () => {
    // 与上一条成对：陌生键丢弃、必填键缺失报错。少了这半边，解析器会产出
    // 静态类型承诺了 contentType / step、运行时却没有的 format，
    // 且 rating 的全部范围校验会被静默关掉。
    const cases: readonly (readonly [string, LooseDto])[] = [
      [
        'richText 缺 contentType',
        mutate(SEMANTIC, draft => void delete nested(looseField(draft, 'body'), 'format')['contentType'])
      ],
      ['rating 缺 step', mutate(SEMANTIC, draft => void delete nested(looseField(draft, 'score'), 'format')['step'])],
      [
        'currency 缺 currency',
        mutate(SEMANTIC, draft => looseSet(nested(looseField(draft, 'score'), 'format'), 'kind', 'currency'))
      ],
      [
        'percentage 缺 scale',
        mutate(SEMANTIC, draft => looseSet(nested(looseField(draft, 'score'), 'format'), 'kind', 'percentage'))
      ],
      [
        'duration 缺 unit',
        mutate(SEMANTIC, draft => looseSet(nested(looseField(draft, 'score'), 'format'), 'kind', 'duration'))
      ]
    ];

    cases.forEach(([label, input]) => expect(() => parseEntityFieldsDescriptor(input), label).toThrow(/缺少必填配置/));
  });

  it('AC#24 — 必填配置齐全的 format 不受影响', () => {
    const parsed = parseEntityFieldsDescriptor(clone(SEMANTIC));

    expect(fieldOf(parsed, 'body').format).toStrictEqual({ kind: 'richText', contentType: 'text/markdown' });
    expect(fieldOf(parsed, 'score').format).toStrictEqual({ kind: 'rating', min: 1, max: 5, step: 1 });
  });

  it('AC#24 — Record 的业务键原样保留', () => {
    const parsed = parseEntityFieldsDescriptor(clone(ARTICLE));
    const meta = viewOf(fieldOf(parsed, 'meta'));

    expect(Object.keys(meta['keyValueSchema'] as object)).toStrictEqual(['source', 'score']);
    expect(Object.keys(fieldOf(SEMANTIC, 'state').options as object)).toStrictEqual(['review', 'draft', 'published']);
  });

  it('AC#24 — 未知版本显式失败', () => {
    const input = clone(ARTICLE);
    input['dtoVersion'] = 2;

    expect(() => parseEntityFieldsDescriptor(input)).toThrow(RxDBError);
  });

  it('AC#24 — 已知键类型错误显式失败', () => {
    const wrongField = clone(ARTICLE);
    looseField(wrongField, 'title')['field'] = 123;
    const wrongFlag = clone(ARTICLE);
    looseField(wrongFlag, 'title')['unique'] = 'yes';
    const wrongConfig = clone(SEMANTIC);
    nested(looseField(wrongConfig, 'homepage'), 'format')['schemes'] = 'https';

    expect(() => parseEntityFieldsDescriptor(wrongField)).toThrow(RxDBError);
    expect(() => parseEntityFieldsDescriptor(wrongFlag)).toThrow(RxDBError);
    expect(() => parseEntityFieldsDescriptor(wrongConfig)).toThrow(RxDBError);
  });

  it('AC#24 — 数值型 format 配置键的线格式被严格校验', () => {
    const input = clone(SEMANTIC);
    const format = nested(looseField(input, 'publishedAt'), 'format');
    format['kind'] = 'number';
    format['min'] = '1';

    expect(() => parseEntityFieldsDescriptor(input)).toThrow(RxDBError);
  });

  it('AC#24 — 各层已知键的线格式被逐一校验', () => {
    const cases: readonly (readonly [string, unknown])[] = [
      ['顶层不是对象', 5],
      ['fields 不是数组', mutate(ARTICLE, draft => looseSet(draft, 'fields', 'x'))],
      ['字段元素不是对象', mutate(ARTICLE, draft => looseSet(draft.fields, '0', 'x'))],
      ['source 不是合法字面量', mutate(ARTICLE, draft => looseSet(looseField(draft, 'title'), 'source', 'nope'))],
      ['format 不是对象', mutate(SEMANTIC, draft => looseSet(looseField(draft, 'body'), 'format', 'richText'))],
      [
        'format 的字符串配置键给了数值',
        mutate(SEMANTIC, draft => looseSet(nested(looseField(draft, 'body'), 'format'), 'contentType', 1))
      ],
      ['enum 不是字符串数组', mutate(SEMANTIC, draft => looseSet(looseField(draft, 'state'), 'enum', [1]))],
      ['options 不是对象', mutate(SEMANTIC, draft => looseSet(looseField(draft, 'state'), 'options', []))],
      [
        'options 展示项不是对象',
        mutate(SEMANTIC, draft => looseSet(nested(looseField(draft, 'state'), 'options'), 'draft', 'x'))
      ],
      ['keyValueSchema 不是对象', mutate(ARTICLE, draft => looseSet(looseField(draft, 'meta'), 'keyValueSchema', []))],
      [
        'keyValueSchema 条目不是对象',
        mutate(ARTICLE, draft => looseSet(nested(looseField(draft, 'meta'), 'keyValueSchema'), 'source', 'x'))
      ],
      [
        'keyValueSchema 条目的 type 非法',
        mutate(ARTICLE, draft =>
          looseSet(nested(nested(looseField(draft, 'meta'), 'keyValueSchema'), 'source'), 'type', 'blob')
        )
      ],
      [
        '单值关系标成 multiple',
        mutate(ARTICLE, draft => looseSet(looseField(draft, 'author'), 'cardinality', 'multiple'))
      ],
      [
        '多值关系标成 single',
        mutate(ARTICLE, draft => looseSet(looseField(draft, 'comments'), 'cardinality', 'single'))
      ]
    ];

    cases.forEach(([label, input]) => expect(() => parseEntityFieldsDescriptor(input), label).toThrow(RxDBError));
  });

  it('AC#24 — 数值型配置键原样往返', () => {
    const semantic = parseEntityFieldsDescriptor(clone(SEMANTIC));

    expect(fieldOf(semantic, 'score').format).toStrictEqual({ kind: 'rating', min: 1, max: 5, step: 1 });
  });

  it('AC#24 — keyValue 条目缺 label / type 时不补键也不报错', () => {
    const input = clone(FLAGS);
    delete nested(nested(looseField(input, 'kv'), 'keyValueSchema'), 'bare')['type'];

    const bare = nested(
      viewOf(fieldOf(parseEntityFieldsDescriptor(input), 'kv'))['keyValueSchema'] as Record<string, unknown>,
      'bare'
    );

    // 嵌套属性没声明 displayName，条目里就不该冒出 label 键
    expect('label' in bare).toBe(false);
    expect('type' in bare).toBe(false);
  });

  it('AC#24 — 非 JSON-safe 值显式失败', () => {
    const withDate = clone(ARTICLE);
    looseField(withDate, 'publishedAt')['displayName'] = new Date();
    const withNaN = clone(SEMANTIC);
    nested(looseField(withNaN, 'publishedAt'), 'format')['timezone'] = Number.NaN;

    expect(() => parseEntityFieldsDescriptor(withDate)).toThrow(RxDBError);
    expect(() => parseEntityFieldsDescriptor(withNaN)).toThrow(RxDBError);
  });

  it('AC#24 — 给 1:m / m:n 塞 nullable / unique 必须失败，不能当未知键丢弃', () => {
    ['nullable', 'unique', 'required', 'encrypted'].forEach(key => {
      const input = clone(ARTICLE);
      looseField(input, 'comments')[key] = false;
      expect(() => parseEntityFieldsDescriptor(input), key).toThrow(RxDBError);
    });
  });

  it('AC#24 — 给 1:m / m:n 塞 writeField 必须失败，不能当未知键丢弃', () => {
    const input = clone(ARTICLE);
    nested(looseField(input, 'topics'), 'relation')['writeField'] = 'topicsId';

    expect(() => parseEntityFieldsDescriptor(input)).toThrow(RxDBError);
  });

  it('AC#24 — 关系字段带属性维度键必须失败', () => {
    const withFormat = clone(ARTICLE);
    looseField(withFormat, 'author')['format'] = { kind: 'plainText' };
    const withEnum = clone(ARTICLE);
    looseField(withEnum, 'author')['enum'] = ['a'];

    expect(() => parseEntityFieldsDescriptor(withFormat)).toThrow(RxDBError);
    expect(() => parseEntityFieldsDescriptor(withEnum)).toThrow(RxDBError);
  });

  it('AC#24 — source 与 relation / readonly 的组合违反 INV-5 时失败', () => {
    const missingRelation = clone(ARTICLE);
    delete looseField(missingRelation, 'author')['relation'];
    const writableRelation = clone(ARTICLE);
    looseField(writableRelation, 'author')['readonly'] = false;
    const writableComputed = clone(ARTICLE);
    looseField(writableComputed, 'excerpt')['readonly'] = false;
    const propertyWithRelation = clone(ARTICLE);
    looseField(propertyWithRelation, 'title')['relation'] = { kind: '1:1' };

    [missingRelation, writableRelation, writableComputed, propertyWithRelation].forEach(input =>
      expect(() => parseEntityFieldsDescriptor(input)).toThrow(RxDBError)
    );
  });

  it('AC#24 — cardinality 与 valueType 不一致时失败（INV-4）', () => {
    const input = clone(ARTICLE);
    looseField(input, 'tags')['cardinality'] = 'single';

    expect(() => parseEntityFieldsDescriptor(input)).toThrow(RxDBError);
  });

  it('AC#24 — 字段分组顺序违反 INV-6 时失败', () => {
    const input = clone(ARTICLE);
    input.fields = [looseField(input, 'author'), looseField(input, 'title')];

    expect(() => parseEntityFieldsDescriptor(input)).toThrow(RxDBError);
  });
});

describe('AC#26 — 输出稳定性与分组顺序', () => {
  it('同一 metadata 重复输出深相等', () => {
    expect(describeEntityFields(ORDER_METADATA, FIELD_RESOLVER)).toStrictEqual(
      describeEntityFields(ORDER_METADATA, FIELD_RESOLVER)
    );
    expect(describeEntityFields(ARTICLE_METADATA, FIELD_RESOLVER)).toStrictEqual(ARTICLE);
  });

  it('两份 metadata 都按属性 → 计算属性 → 关系分组，组内保留各自插入顺序', () => {
    const forward = describeEntityFields(ORDER_METADATA, FIELD_RESOLVER);
    const reversed = describeEntityFields(ORDER_REVERSED_METADATA, FIELD_RESOLVER);
    const groups = ['property', 'property', 'property', 'computed', 'computed', 'relation', 'relation'];

    expect(forward.fields.map(item => item.source)).toStrictEqual(groups);
    expect(reversed.fields.map(item => item.source)).toStrictEqual(groups);
    // 组内顺序各自跟随 Map 插入顺序：逆序声明就逆序输出，不存在隐式字母排序
    expect(forward.fields.map(item => item.field)).toStrictEqual([
      'alpha',
      'beta',
      'gamma',
      'first',
      'second',
      'left',
      'right'
    ]);
    expect(reversed.fields.map(item => item.field)).toStrictEqual([
      'gamma',
      'beta',
      'alpha',
      'second',
      'first',
      'right',
      'left'
    ]);
  });
});
