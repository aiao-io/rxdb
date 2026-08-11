import { describe, expect, expectTypeOf, it } from 'vitest';
import type { EntityType } from '../../entity/entity.interface.js';
import type { Rule, RuleGroup } from '../../repository/query.interface.js';
import type {
  AdapterRepositoryConstructor,
  IRxDBAdapterOptions,
  RepositoryConstructor,
  RepositoryInstance,
  TransactionFun
} from '../../rxdb-adapter.js';
import { RxDBAdapterBase, RxDBAdapterLocalBase } from '../../rxdb-adapter.js';
import type { RxDB } from '../../RxDB.js';

class FirstEntity {}
class SecondEntity {}

class CoreRepository implements RepositoryInstance {
  constructor(
    readonly rxdb: RxDB,
    readonly EntityType: EntityType
  ) {}
}

abstract class CompatibleLocalAdapter extends RxDBAdapterLocalBase {
  abstract override transaction(fun: TransactionFun): Promise<unknown>;

  abstract override createTables(EntityTypes: EntityType[], entities?: InstanceType<EntityType>[]): Promise<boolean>;
}

class AdapterRepository implements RepositoryInstance {
  constructor(
    readonly adapter: CompatibleLocalAdapter,
    readonly EntityType: EntityType
  ) {}
}

interface ParentFilter {
  name: string;
  author: AuthorFilter | null;
  children: readonly ChildFilter[] | null | undefined;
}

interface AuthorFilter {
  name: string;
}

interface ChildFilter {
  active: boolean;
}

interface NamedAdapterOptions {
  endpoint: string;
  retries?: number;
}

const constructCoreRepository = (
  RepositoryClass: RepositoryConstructor<CoreRepository>,
  rxdb: RxDB,
  EntityType: EntityType
): CoreRepository => new RepositoryClass(rxdb, EntityType);

const constructAdapterRepository = (
  RepositoryClass: AdapterRepositoryConstructor<CompatibleLocalAdapter, AdapterRepository>,
  adapter: CompatibleLocalAdapter,
  EntityType: EntityType
): AdapterRepository => new RepositoryClass(adapter, EntityType);

const callTransaction = (adapter: Pick<RxDBAdapterLocalBase, 'transaction'>): Promise<number> =>
  adapter.transaction(async () => 42);

const callCreateTables = (
  adapter: Pick<RxDBAdapterLocalBase, 'createTables'>,
  EntityTypes: EntityType[],
  entities: InstanceType<EntityType>[]
): Promise<boolean> => adapter.createTables(EntityTypes, entities);

const nullableRelationExists = {
  field: 'author',
  operator: 'exists',
  where: {
    combinator: 'and',
    rules: [{ field: 'name', operator: '=', value: 'Jimmy' }]
  }
} satisfies Rule<ParentFilter>;

const dynamicNestedExists = {
  combinator: 'and',
  rules: [
    {
      field: 'children',
      operator: 'exists',
      where: {
        combinator: 'and',
        rules: [{ field: 'active', operator: '=', value: true }]
      }
    }
  ]
} satisfies RuleGroup;

const typedRuleGroup = {
  combinator: 'and',
  rules: [
    { field: 'name', operator: '=', value: 'root' },
    {
      field: 'author',
      operator: 'exists',
      where: {
        combinator: 'and',
        rules: [{ field: 'name', operator: '=', value: 'Jimmy' }]
      }
    },
    {
      field: 'children',
      operator: 'exists',
      where: {
        combinator: 'and',
        rules: [{ field: 'active', operator: '=', value: true }]
      }
    }
  ]
} satisfies RuleGroup<ParentFilter>;

const erasedRuleGroup: RuleGroup = typedRuleGroup;
const namedOptions: NamedAdapterOptions = { endpoint: 'https://example.test', retries: 2 };
const publicOptions: IRxDBAdapterOptions = namedOptions;

describe('public type compatibility', () => {
  it('keeps core and adapter repository constructors callable with two arguments', () => {
    expectTypeOf(constructCoreRepository).returns.toEqualTypeOf<CoreRepository>();
    expectTypeOf(constructAdapterRepository).returns.toEqualTypeOf<AdapterRepository>();
    expect(RxDBAdapterBase).toBeDefined();
  });

  it('supports dynamic nested exists and typed RuleGroup erasure', () => {
    type NameEqualityRule = Extract<Rule<ParentFilter, 'name'>, { operator: '=' | '!=' }>;

    expectTypeOf<NameEqualityRule['field']>().toEqualTypeOf<'name'>();
    expectTypeOf<NameEqualityRule['value']>().toEqualTypeOf<string>();
    expectTypeOf(nullableRelationExists.where?.rules[0]).toMatchTypeOf<Rule<AuthorFilter> | undefined>();
    expectTypeOf(typedRuleGroup).toMatchTypeOf<RuleGroup<ParentFilter>>();
    expectTypeOf(erasedRuleGroup).toEqualTypeOf<RuleGroup>();
    expect(dynamicNestedExists.rules[0]?.where?.rules).toHaveLength(1);
  });

  it('accepts named options and legacy local adapter overrides', () => {
    expectTypeOf(publicOptions).toEqualTypeOf<IRxDBAdapterOptions>();
    expectTypeOf<CompatibleLocalAdapter['transaction']>().toMatchTypeOf<RxDBAdapterLocalBase['transaction']>();
    expectTypeOf(callTransaction).returns.toEqualTypeOf<Promise<number>>();
    expectTypeOf(callCreateTables).returns.toEqualTypeOf<Promise<boolean>>();
    expect(callCreateTables).toBeTypeOf('function');
    expect([new FirstEntity(), new SecondEntity()]).toHaveLength(2);
  });
});
