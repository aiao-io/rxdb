import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { extractEntityFields } from '../../entity/entity-field.utils.js';
import type { EntityStaticType, RxDBEntityId } from '../../entity/entity.interface.js';
import { fillDefaultValue } from '../../entity/entity.utils.js';
import {
  PropertyType,
  RelationKind,
  type BigIntProperty,
  type BinaryProperty,
  type EntityPropertyMetadataOptions,
  type EntityRelationMetadataOptions,
  type KeyValuePropertyMetadata
} from '../../entity/metadata-options.interface.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';
import type { BigIntRules, BinaryRules } from '../../repository/query.interface.js';

type BigIntEntity = new () => { id: bigint };

interface BigIntBinaryFields {
  count: bigint;
  payload: Uint8Array | null;
}

type BigIntOperator = BigIntRules<BigIntBinaryFields, 'count'>['operator'];
type BinaryOperator = BinaryRules<BigIntBinaryFields, 'payload'>['operator'];

describe('bigint and binary public contracts', () => {
  it('rejects invalid defaults, binary ids and excluded composite forms at compile time', () => {
    const assertInvalidContracts = () => {
      // @ts-expect-error bigint defaults must not accept numbers
      const invalidBigIntDefault: BigIntProperty = { name: 'count', type: PropertyType.bigint, default: 1 };
      // @ts-expect-error binary defaults must not accept arrays
      const invalidBinaryDefault: BinaryProperty = { name: 'payload', type: PropertyType.binary, default: [1] };
      // @ts-expect-error binary fields cannot be primary keys
      const invalidBinaryPrimary: BinaryProperty = { name: 'payload', type: PropertyType.binary, primary: true };
      const invalidBinaryForeignKey: EntityRelationMetadataOptions = {
        name: 'owner',
        kind: RelationKind.MANY_TO_ONE,
        mappedEntity: 'Owner',
        mappedProperty: 'items',
        // @ts-expect-error relation foreign keys must be RxDBEntityId, never binary
        default: new Uint8Array([1])
      };
      // @ts-expect-error bigint arrays are outside the public property contract
      const invalidBigIntArray = PropertyType.bigintArray;
      // @ts-expect-error binary arrays are outside the public property contract
      const invalidBinaryArray = PropertyType.binaryArray;
      // @ts-expect-error keyValue does not allow nested bigint fields
      const invalidNestedBigInt: KeyValuePropertyMetadata = { name: 'count', type: PropertyType.bigint };
      // @ts-expect-error keyValue does not allow nested binary fields
      const invalidNestedBinary: KeyValuePropertyMetadata = { name: 'payload', type: PropertyType.binary };
      void [
        invalidBigIntDefault,
        invalidBinaryDefault,
        invalidBinaryPrimary,
        invalidBinaryForeignKey,
        invalidBigIntArray,
        invalidBinaryArray,
        invalidNestedBigInt,
        invalidNestedBinary
      ];
    };
    expectTypeOf(assertInvalidContracts).toBeFunction();
  });

  it('exposes the property types, entity id and legal query operators', () => {
    expect(PropertyType.bigint).toBe('bigint');
    expect(PropertyType.binary).toBe('binary');
    expectTypeOf<RxDBEntityId>().toEqualTypeOf<string | number | bigint>();
    expectTypeOf<EntityStaticType<BigIntEntity, 'idType'>>().toEqualTypeOf<bigint>();
    expectTypeOf<BigIntOperator>().toEqualTypeOf<
      '=' | '!=' | 'null' | 'notNull' | '<' | '>' | '<=' | '>=' | 'in' | 'notIn' | 'between' | 'notBetween'
    >();
    expectTypeOf<BinaryOperator>().toEqualTypeOf<'=' | '!=' | 'null' | 'notNull' | 'in' | 'notIn'>();
  });

  it('preserves bigint and binary metadata declared with enum or literal values', () => {
    const properties = [
      { name: 'id', type: PropertyType.bigint, primary: true, sortable: true, default: 1n },
      {
        name: 'payload',
        columnName: 'payload_blob',
        type: 'binary',
        nullable: true,
        unique: true,
        default: new Uint8Array([1, 2])
      }
    ] satisfies EntityPropertyMetadataOptions[];
    const relation = {
      name: 'owner',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'Owner',
      mappedProperty: 'items',
      default: 1n
    } satisfies EntityRelationMetadataOptions;
    const metadata = transitionMetadata({ name: 'Artifact', properties, relations: [relation] });

    expect(metadata.propertyMap.get('id')).toMatchObject({
      type: PropertyType.bigint,
      primary: true,
      sortable: true
    });
    expect(metadata.propertyMap.get('payload')).toMatchObject({
      columnName: 'payload_blob',
      type: PropertyType.binary,
      nullable: true,
      unique: true
    });
    expect(metadata.relationMap.get('owner')).toMatchObject({ default: 1n });
    expectTypeOf<BigIntProperty['default']>().toEqualTypeOf<bigint | (() => bigint) | undefined>();
    expectTypeOf<'primary' extends keyof BinaryProperty ? true : false>().toEqualTypeOf<false>();

    expect(extractEntityFields(metadata)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'payload',
          type: PropertyType.binary,
          nullable: true,
          unique: true
        })
      ])
    );
  });

  it('copies binary constant and factory defaults per entity and preserves subarray bounds', () => {
    const source = new Uint8Array([9, 1, 2, 8]);
    const factory = vi.fn(() => source.subarray(1, 3));
    const metadata = transitionMetadata({
      name: 'Artifact',
      properties: [
        { name: 'constant', type: PropertyType.binary, default: source.subarray(1, 3) },
        { name: 'generated', type: PropertyType.binary, default: factory }
      ]
    });
    const first: { constant?: Uint8Array; generated?: Uint8Array } = {};
    const second: { constant?: Uint8Array; generated?: Uint8Array } = {};

    fillDefaultValue(metadata, first);
    fillDefaultValue(metadata, second);
    first.constant![0] = 7;
    first.generated![1] = 6;

    expect(factory).toHaveBeenCalledTimes(2);
    expect(first.constant).toEqual(new Uint8Array([7, 2]));
    expect(second.constant).toEqual(new Uint8Array([1, 2]));
    expect(first.generated).toEqual(new Uint8Array([1, 6]));
    expect(second.generated).toEqual(new Uint8Array([1, 2]));
    expect(first.constant).not.toBe(second.constant);
    expect(first.generated).not.toBe(second.generated);
    expect(first.constant?.buffer).not.toBe(source.buffer);
  });
});
