/**
 * @fileoverview US-012 阶段 A — 元数据层与注册期集成（AC#1～3、AC#7）。
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { ENTITY_BASE_METADATA_OPTIONS, EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { ENTITY_STATIC_TYPES, type EntityType, type UUID } from '../../entity/entity.interface.js';
import {
  type EntityMetadataOptions,
  PropertyType,
  type StringProperty,
  SyncType
} from '../../entity/metadata-options.interface.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';
import type { IRxDBAdapter } from '../../rxdb-adapter.js';
import { RxDB } from '../../RxDB.js';
import { ENTITY_MANAGER } from '../../rxdb.private.js';
import { RxDBError } from '../../RxDBError.js';

const stringProp = (name: string, extra: Partial<StringProperty> = {}): StringProperty =>
  ({ name, type: PropertyType.string, ...extra }) as StringProperty;

const mkOptions = (properties: StringProperty[]): EntityMetadataOptions =>
  ({
    name: 'User' as Capitalize<string>,
    namespace: 'public',
    properties,
    computedProperties: [],
    relations: [],
    indexes: []
  }) as EntityMetadataOptions;

const mockAdapter = {
  name: 'sqlite',
  find: async () => [],
  count: async () => 0,
  mutations: async () => [],
  getRepository: () => mockAdapter
} as unknown as IRxDBAdapter;

describe('AC#1 — 未声明 format 的字段不出现 format 键', () => {
  it('propertyMap 条目上没有 format 键，也不填默认值', () => {
    const metadata = transitionMetadata(mkOptions([stringProp('title')]), ENTITY_BASE_METADATA_OPTIONS);
    const title = metadata.propertyMap.get('title')!;
    expect('format' in title).toBe(false);
    [...metadata.propertyMap.values()].forEach(property => expect('format' in property).toBe(false));
  });
});

describe('AC#2 — format 判别对象原样保留且不改变 type', () => {
  it.each([
    ['url', { kind: 'url', schemes: ['https'] }],
    ['email', { kind: 'email' }],
    ['phone', { kind: 'phone' }]
  ] as const)('%s', (_label, format) => {
    const metadata = transitionMetadata(
      mkOptions([stringProp('contact', { format } as Partial<StringProperty>)]),
      ENTITY_BASE_METADATA_OPTIONS
    );
    const contact = metadata.propertyMap.get('contact')!;
    expect(contact.type).toBe(PropertyType.string);
    expect((contact as unknown as Record<string, unknown>)['format']).toEqual(format);
  });
});

describe('AC#3 — INV-2 元数据层证明', () => {
  it('除 format 键外两份元数据完全相同', () => {
    const plain = transitionMetadata(
      mkOptions([stringProp('title'), stringProp('homepage')]),
      ENTITY_BASE_METADATA_OPTIONS
    );
    const annotated = transitionMetadata(
      mkOptions([
        stringProp('title'),
        stringProp('homepage', { format: { kind: 'url', schemes: ['https'] } } as Partial<StringProperty>)
      ]),
      ENTITY_BASE_METADATA_OPTIONS
    );

    expect([...annotated.propertyMap.keys()]).toEqual([...plain.propertyMap.keys()]);
    expect([...annotated.indexMap.keys()]).toEqual([...plain.indexMap.keys()]);

    const strip = (metadata: typeof plain): unknown =>
      JSON.parse(
        JSON.stringify(
          [...metadata.propertyMap.entries()].map(([key, property]) => [
            key,
            Object.fromEntries(
              Object.entries(property as unknown as Record<string, unknown>).filter(([prop]) => prop !== 'format')
            )
          ])
        )
      );
    expect(strip(annotated)).toEqual(strip(plain));

    const homepage = annotated.propertyMap.get('homepage')!;
    expect(homepage.type).toBe(PropertyType.string);
    expect((homepage as unknown as Record<string, unknown>)['format']).toEqual({ kind: 'url', schemes: ['https'] });
  });
});

describe('AC#7 — 跨实体聚合校验', () => {
  @Entity({ name: 'ValidFirst', properties: [{ name: 'title', type: PropertyType.string }] })
  class ValidFirst extends EntityBase {
    static [ENTITY_STATIC_TYPES]: { idType: UUID };
    title!: string;
  }

  @Entity({
    name: 'BadSecond',
    properties: [
      { name: 'homepage', type: PropertyType.string, format: { kind: 'bogus' } } as never,
      { name: 'amount', type: PropertyType.number, format: { kind: 'currency' } } as never
    ]
  })
  class BadSecond extends EntityBase {
    static [ENTITY_STATIC_TYPES]: { idType: UUID };
    homepage!: string;
    amount!: number;
  }

  @Entity({
    name: 'BadThird',
    properties: [{ name: 'state', type: PropertyType.enum, enum: ['a', 'a'] }]
  })
  class BadThird extends EntityBase {
    static [ENTITY_STATIC_TYPES]: { idType: UUID };
    state!: string;
  }

  let error: unknown;

  beforeAll(() => {
    const rxdb = new RxDB({
      dbName: 'US012PhaseA',
      entities: [ValidFirst, BadSecond, BadThird],
      sync: { local: { adapter: 'sqlite' }, type: SyncType.None }
    });
    rxdb.adapter('sqlite', () => mockAdapter);
    try {
      rxdb.entityManager.init();
    } catch (caught) {
      error = caught;
    }
  });

  it('一次异常报出两个实体的全部违规', () => {
    expect(error).toBeInstanceOf(RxDBError);
    const message = (error as RxDBError).message;
    expect(message).toContain('BadSecond');
    expect(message).toContain('BadThird');
    expect(message).toContain('homepage');
    expect(message).toContain('amount');
    expect(message).toContain('unknownFormat');
    expect(message).toContain('missingFormatConfig');
    expect(message).toContain('duplicateEnum');
  });

  it('不在第一个违规实体处中断', () => {
    expect((error as RxDBError).message).toContain('3 项');
  });

  it('排在前面的合法实体同样解析不到 manager，部分注册没有泄漏', () => {
    const resolveManagerOf = (EntityType: EntityType): unknown => {
      const descriptor = Object.getOwnPropertyDescriptor(EntityType.prototype, ENTITY_MANAGER);
      if (!descriptor?.get) throw new RxDBError(`Entity needs an initialized RxDB`);
      return descriptor.get.call(EntityType.prototype);
    };
    expect(() => resolveManagerOf(ValidFirst)).toThrow(RxDBError);
  });
});
