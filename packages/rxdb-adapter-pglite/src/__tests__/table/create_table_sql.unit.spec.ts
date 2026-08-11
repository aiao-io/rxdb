import {
  Entity,
  EntityBase,
  getEntityMetadata,
  PropertyType,
  RelationKind,
  RxDB,
  SyncType,
  transitionMetadata
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import create_table_sql from '../../table/create_table_sql.js';

@Entity({
  name: 'CtsParent',
  properties: [
    { name: 'id', type: PropertyType.integer, primary: true },
    { name: 'title', type: PropertyType.string, nullable: true }
  ],
  indexes: [{ name: 'id_title', properties: ['id', 'title'], unique: true }]
})
class CtsParent extends EntityBase {}

@Entity({
  name: 'CtsChild',
  properties: [
    { name: 'title', type: PropertyType.string, nullable: true },
    { name: 'createdAt', type: PropertyType.date, default: () => new Date('2020-01-01T00:00:00.000Z') },
    { name: 'flag', type: PropertyType.boolean, default: false },
    { name: 'score', type: PropertyType.number, default: 3 },
    { name: 'status', type: PropertyType.enum, enum: ["a'", 'b'], nullable: true },
    { name: 'weird', type: PropertyType.json, default: { x: 1 }, nullable: true },
    { name: 'uniqueCol', type: PropertyType.string, unique: true, nullable: true }
  ],
  indexes: [{ name: 'title_idx', properties: ['title'], unique: true }],
  relations: [
    {
      name: 'parentReq',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'CtsParent',
      mappedProperty: 'children',
      nullable: false,
      default: () => 9
    },
    {
      name: 'parentOpt',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'CtsParent',
      mappedProperty: 'children',
      nullable: true
    },
    {
      name: 'parentCascade',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'CtsParent',
      mappedProperty: 'children',
      nullable: false,
      onDelete: 'CASCADE'
    },
    {
      name: 'card',
      kind: RelationKind.ONE_TO_ONE,
      mappedEntity: 'CtsParent',
      mappedProperty: 'child',
      nullable: true
    },
    {
      name: 'many',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'CtsParent',
      mappedProperty: 'y'
    }
  ],
  foreignKeys: [
    {
      name: 'parent_title_consistency',
      properties: ['parentReqId', 'title'],
      mappedEntity: 'CtsParent',
      mappedProperties: ['id', 'title']
    }
  ]
})
class CtsChild extends EntityBase {}

const makeAdapter = () => {
  const rxdb = new RxDB({
    dbName: `pglite-create-table-unit-${Date.now()}`,
    entities: [CtsParent, CtsChild],
    sync: { local: { adapter: 'pglite' }, type: SyncType.None }
  });
  rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' })).init();
  return new RxDBAdapterPGlite(rxdb, { store: 'memory' });
};

describe('create_table_sql pure unit edges', () => {
  const adapter = makeAdapter();

  it('throws when columns empty', () => {
    const metadata = transitionMetadata({ name: 'EmptyCols', namespace: 'test' });
    expect(() => create_table_sql(adapter, metadata)).toThrow(/columns is empty/);
  });

  it('covers defaults, enums, unique indexes, and relation FK branches', () => {
    const metadata = getEntityMetadata(CtsChild);
    const sql = create_table_sql(adapter, metadata);

    expect(sql).toContain('PRIMARY KEY');
    expect(sql).not.toContain("DEFAULT '2020-01-01T00:00:00.000Z'");
    expect(sql).toContain('DEFAULT false');
    expect(sql).toContain('DEFAULT 3');
    expect(sql).toContain("'a'''");
    expect(sql).toContain(`DEFAULT E'{"x":1}'::jsonb`);
    expect(sql).toContain('CREATE UNIQUE INDEX');
    expect(sql).toContain('idx_');
    expect(sql).toContain('ON DELETE CASCADE');
    expect(sql).toContain('ON DELETE SET NULL');
    expect(sql).toContain('DEFERRABLE INITIALLY DEFERRED');
    expect(sql).toContain('FOREIGN KEY');
    expect(sql).not.toContain("DEFAULT '9'");
    expect(sql).toMatch(/"parentReqId"\s+integer/);
    expect(sql).toContain(
      'CONSTRAINT "CtsChild_parent_title_consistency_fk" FOREIGN KEY ("parentReqId", "title") REFERENCES "public"."CtsParent"("id", "title")'
    );
  });

  it('fails when mapped metadata throws or is missing', () => {
    const base = getEntityMetadata(CtsChild);
    const relationMap = new Map(base.relationMap);
    relationMap.set('ghost', {
      name: 'ghost',
      kind: RelationKind.MANY_TO_ONE,
      columnName: 'ghostId',
      mappedEntity: 'GhostEntity',
      mappedProperty: 'x',
      nullable: true
    } as never);

    // propertyMap/relationMap 不可枚举（setSafeObjectKey）；使用原型加自有覆盖。
    const metadata = Object.create(base) as typeof base;
    Object.defineProperty(metadata, 'relationMap', { value: relationMap, enumerable: true });

    const original = adapter.rxdb.schemaManager.getEntityMetadata.bind(adapter.rxdb.schemaManager);
    let ghostCalls = 0;
    adapter.rxdb.schemaManager.getEntityMetadata = ((name: string, ns: string) => {
      if (name === 'GhostEntity') {
        ghostCalls += 1;
        if (ghostCalls === 1) throw new Error('missing');
        return undefined as never;
      }
      return original(name, ns);
    }) as typeof original;

    try {
      expect(() => create_table_sql(adapter, metadata)).toThrow('missing');
    } finally {
      adapter.rxdb.schemaManager.getEntityMetadata = original;
    }
  });

  it('ONE_TO_ONE without onDelete skips M2O cascade default; non-null M2O cascades', () => {
    const base = getEntityMetadata(CtsChild);
    const relationMap = new Map(base.relationMap);
    relationMap.set('requiredNoDelete', {
      name: 'requiredNoDelete',
      kind: RelationKind.MANY_TO_ONE,
      columnName: 'requiredNoDeleteId',
      mappedEntity: 'CtsParent',
      mappedProperty: 'children',
      nullable: false
    } as never);
    relationMap.set('o2oNoDelete', {
      name: 'o2oNoDelete',
      kind: RelationKind.ONE_TO_ONE,
      columnName: 'o2oNoDeleteId',
      mappedEntity: 'CtsParent',
      mappedProperty: 'child',
      nullable: false
    } as never);

    const metadata = Object.create(base) as typeof base;
    Object.defineProperty(metadata, 'relationMap', { value: relationMap, enumerable: true });

    const sql = create_table_sql(adapter, metadata);
    expect(sql).toContain('"requiredNoDeleteId"');
    expect(sql).toContain('"o2oNoDeleteId"');
    expect(sql).toContain('ON DELETE CASCADE');
    expect(sql).toMatch(/UNIQUE INDEX.*"o2oNoDeleteId"/s);
  });

  it('uses string primary key type and CURRENT_TIMESTAMP / now()', () => {
    const metadata = transitionMetadata({
      name: 'StrId',
      namespace: 'test',
      properties: [
        { name: 'id', type: PropertyType.string, primary: true },
        { name: 'a', type: PropertyType.date, default: 'CURRENT_TIMESTAMP' },
        { name: 'b', type: PropertyType.date, default: 'now()' as unknown as Date },
        { name: 'c', type: PropertyType.string, default: 'hello' }
      ]
    });
    const sql = create_table_sql(adapter, metadata);
    expect(sql).toContain('PRIMARY KEY');
    expect(sql).toContain('DEFAULT now()');
    expect(sql).toContain("DEFAULT 'hello'");
  });
});
