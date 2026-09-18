import { getEntityMetadata, RxDB } from '@aiao/rxdb';
import { createSchemaFromEntity } from '@aiao/rxdb-model';
import type { RxDBQueryOutput } from '@aiao/rxdb-model-angular';
import { Todo } from '@aiao/rxdb-test/entities';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const angularModelMocks = vi.hoisted(() => ({
  EntityListComponent: class {},
  EntityDetailComponent: class {},
  QueryBuilderComponent: class {}
}));

vi.mock('@aiao/rxdb-model-angular', () => angularModelMocks);

import EntityDetailPage from './entity-detail.page';
import EntityListPage from './entity-list.page';
import QueryBuilderPage from './query-builder.page';

const makeRxdb = () => ({});

const configure = (rxdb: ReturnType<typeof makeRxdb>) => {
  TestBed.configureTestingModule({
    providers: [{ provide: RxDB, useValue: rxdb }]
  });
};

describe('entity demo page construction contracts', () => {
  let findAllMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Todo.findAll 是 `declare static`：模块加载时类上还没有该属性，
    // 由实体系统在装配期挂载，spyOn 拿不到；这里直接定义桩属性。
    findAllMock = vi.fn(() => of([]));
    Object.defineProperty(Todo, 'findAll', { value: findAllMock, configurable: true, writable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('entity-list 页以 namespace + name 绑定实体列表组件', () => {
    const rxdb = makeRxdb();
    configure(rxdb);

    const page = TestBed.runInInjectionContext(() => new EntityListPage());
    expect(page).toBeInstanceOf(EntityListPage);
    expect(page.rxdb).toBe(rxdb);
  });

  it('entity-detail 页的保存/取消回调只做日志上报，不吞异常', () => {
    const rxdb = makeRxdb();
    configure(rxdb);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const page = TestBed.runInInjectionContext(() => new EntityDetailPage());
    page.onSaved({ title: 'todo-1' });
    page.onCancelled();

    expect(infoSpy).toHaveBeenCalledTimes(2);
  });

  it('query-builder 页从 Todo 元数据派生 schema，并把查询变更驱动到 Todo.findAll', () => {
    const rxdb = makeRxdb();
    configure(rxdb);

    const page = TestBed.runInInjectionContext(() => new QueryBuilderPage());

    // schema 来自真实实体元数据（纯派生，不依赖数据库实例）
    expect(page.schema.entityName).toBe('Todo');
    expect(page.schema.fields.map(f => f.name)).toEqual(expect.arrayContaining(['title', 'completed']));
    expect(page.schema.fields.map(f => f.name)).toEqual(
      expect.arrayContaining(createSchemaFromEntity(getEntityMetadata(Todo)).map(f => f.name))
    );

    // 查询变更 → 触发一次带条件的 findAll
    const query = { combinator: 'and', rules: [{ field: 'title', operator: 'contains', value: 'a' }] } as const;
    page.onQueryChange(query as unknown as RxDBQueryOutput<Todo>);
    expect(findAllMock).toHaveBeenCalledWith(expect.objectContaining({ where: query }));
  });
});
