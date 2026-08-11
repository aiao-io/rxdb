import { RxDB, SyncType } from '@aiao/rxdb';
import { MenuSimple, Todo } from '@aiao/rxdb-test/entities';
import { beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterSupabase } from '../index.js';

const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || '';
const SUPABASE_KEY = import.meta.env['VITE_SUPABASE_KEY'] || '';

describe('RxDB Supabase 适配器', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterSupabase;

  beforeAll(async () => {
    rxdb = new RxDB({
      context: { userId: 'userId' },
      dbName: 'db',
      entities: [Todo, MenuSimple],
      sync: {
        remote: {
          adapter: 'supabase'
        },
        type: SyncType.None
      }
    });

    rxdb.adapter(
      'supabase',
      async db =>
        new RxDBAdapterSupabase(db, {
          supabaseUrl: SUPABASE_URL,
          supabaseKey: SUPABASE_KEY
        })
    );
    rxdb.init();
    adapter = (await rxdb.getAdapter('supabase')) as RxDBAdapterSupabase;
    await adapter.connect();
  });

  it("rxdb.connect('supabase') 连接数据库后能返回插件实例", async () => {
    expect(adapter).toBeInstanceOf(RxDBAdapterSupabase);
  });

  it('adapter.version() 能返回数据库版本', async () => {
    const version = await adapter.version();
    expect(version).toMatch(/^PostgreSQL \d+\./);
  });

  it('isTableExisted(Todo) 应该能正确检查表是否存在', async () => {
    const exists = await adapter.isTableExisted(Todo);
    expect(exists).toEqual(true);
  });

  it('isTableExisted(MenuSimple) 应该能正确检查表是否存在', async () => {
    const exists = await adapter.isTableExisted(MenuSimple);
    expect(exists).toEqual(false);
  });

  it('create todo', async () => {
    const todo = new Todo();
    todo.title = 'Fanny';
    const repository = adapter.getRepository(Todo);
    await repository.create(todo);
    const todos = await repository.find({
      where: {
        combinator: 'and',
        rules: [
          {
            field: 'id',
            operator: '=',
            value: todo.id
          }
        ]
      }
    });
    expect(todos[0].title).toEqual('Fanny');
    await repository.remove(todos[0]);
  });
});
