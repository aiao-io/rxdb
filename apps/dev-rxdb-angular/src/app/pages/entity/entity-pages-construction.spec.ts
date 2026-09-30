import { Entity, EntityBase, RxDB } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const angularModelMocks = vi.hoisted(() => ({
  EntityListComponent: class {},
  EntityDetailComponent: class {}
}));

vi.mock('@aiao/rxdb-model-angular', () => angularModelMocks);
vi.mock('@aiao/rxdb-angular', () => ({
  useCount: () => ({ value: () => 0 })
}));

import EntityDetailPage from './entity-detail.page';
import EntityListPage from './entity-list.page';
import EntityPage from './entity.page';

/** 非 public namespace 的测试实体（壳页分组用）。 */
@Entity({ name: 'ShellOther', namespace: 'other' })
class ShellOther extends EntityBase {}

const makeRxdb = (entities: unknown[] = [Todo]) => ({ config: { entities } });
const makeRouter = () => ({ navigate: vi.fn(), events: of(new NavigationEnd(0, '/entities', '/entities')) });
const makeRoute = (children: unknown[] = []) => ({ children }) as unknown as ActivatedRoute;

const configure = (rxdb: ReturnType<typeof makeRxdb>, router: ReturnType<typeof makeRouter>, route: ActivatedRoute) => {
  TestBed.configureTestingModule({
    providers: [
      { provide: RxDB, useValue: rxdb },
      { provide: Router, useValue: router },
      { provide: ActivatedRoute, useValue: route }
    ]
  });
};

describe('entity demo page construction contracts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('entity 壳页：public 实体平铺、其余按 namespace 分组，无子路由时重定向到首个实体', () => {
    const rxdb = makeRxdb([ShellOther, Todo]);
    const router = makeRouter();
    const route = makeRoute([]);
    configure(rxdb, router, route);

    const page = TestBed.runInInjectionContext(() => new EntityPage());
    expect(page.publicEntities.map(e => e.name)).toEqual(['Todo']);
    expect(page.entityGroups).toEqual([
      { namespace: 'other', entities: [expect.objectContaining({ name: 'ShellOther', key: 'other:ShellOther' })] }
    ]);
    // 空子路由 → 相对导航到首个实体
    expect(router.navigate).toHaveBeenCalledWith(['other', 'ShellOther'], { relativeTo: route });
  });

  it('entity 壳页：已有子路由时不重定向', () => {
    const rxdb = makeRxdb([ShellOther, Todo]);
    const router = makeRouter();
    const route = makeRoute([{ snapshot: {} }]);
    configure(rxdb, router, route);

    TestBed.runInInjectionContext(() => new EntityPage());
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('entity-list 页以 namespace/name 路由输入定位实体（查看由组件内置编辑对话框承载）', () => {
    const rxdb = makeRxdb();
    const router = makeRouter();
    const route = makeRoute();
    configure(rxdb, router, route);

    const page = TestBed.runInInjectionContext(() => new EntityListPage());
    expect(page).toBeInstanceOf(EntityListPage);
    expect(page.rxdb).toBe(rxdb);
    expect(typeof page.namespace).toBe('function');
    expect(typeof page.name).toBe('function');
  });

  it('entity-detail 页按 namespace/name/entityId 路由输入定位实体，保存/取消后相对导航回实体列表', () => {
    const rxdb = makeRxdb();
    const router = makeRouter();
    const route = makeRoute();
    configure(rxdb, router, route);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const page = TestBed.runInInjectionContext(() => new EntityDetailPage());
    expect(page.rxdb).toBe(rxdb);
    expect(typeof page.namespace).toBe('function');
    expect(typeof page.name).toBe('function');
    expect(typeof page.entityId).toBe('function');

    page.onSaved({ title: 'todo-1' });
    page.onCancelled();

    expect(infoSpy).toHaveBeenCalledTimes(2);
    expect(router.navigate).toHaveBeenCalledTimes(2);
    expect(router.navigate).toHaveBeenNthCalledWith(1, ['..'], { relativeTo: route });
    expect(router.navigate).toHaveBeenNthCalledWith(2, ['..'], { relativeTo: route });
  });
});
