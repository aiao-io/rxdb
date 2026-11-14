vi.mock('@aiao/rxdb-plugin-tree', () => vi.importMock('@aiao/rxdb'));

import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 只替掉「让实体装饰器在导入期能跑完」所需的那几个符号。
 *
 * 本文件的断言全部围绕 `lastError` 的渲染。`save()` 的 no-op 假实现不是死代码：
 * DesignerComponent 挂载时会自动创建默认设计 `schema`（无设计时），没有它
 * 默认创建会失败并把 `lastError` 弄脏。
 */
vi.mock('@aiao/rxdb', () => ({
  __decorateClass: (_d: unknown[], target: unknown) => target,
  RxDB: class {},
  Entity: () => (target: unknown) => target,
  TreeEntity: () => (target: unknown) => target,
  EntityBase: class {
    async save() {
      // 默认设计的自动创建需要 no-op save，本套件不建真实实体
    }
  },
  TreeAdjacencyListEntityBase: class {},
  PropertyType: { string: 'string', number: 'number', integer: 'integer', boolean: 'boolean' },
  RelationKind: { ONE_TO_MANY: 'ONE_TO_MANY', MANY_TO_ONE: 'MANY_TO_ONE' },
  OnDeleteAction: { CASCADE: 'CASCADE' },
  ENTITY_BASE_METADATA_OPTIONS: { properties: [], computedProperties: [], relations: [] },
  TREE_ADJACENCY_LIST_ENTITY_BASE_OPTIONS: { properties: [], computedProperties: [], relations: [] }
}));

/**
 * `useFindAll` 的返回值里有 **error 信号**，而本仓 13 处调用点此前无一读过它
 *（[缺陷台账 #21](../../../../../requirements/known-defects.md)）。
 * 替身必须能表达「活查询出错」，否则测不出那条路径——**替身比真实上游干净**
 * 是本仓反复踩中的坑（#16）。
 */
const queryErrors = new Map<string, ReturnType<typeof signal<Error | undefined>>>();

/** 让某个实体类型的活查询进入 error 态；返回可写信号供用例操控 */
function failQuery(entityName: string, error: Error): void {
  queryErrors.get(entityName)?.set(error);
}

vi.mock('@aiao/rxdb-angular', () => ({
  useFindAll: (EntityType: { name?: string }) => {
    const key = EntityType?.name ?? 'unknown';
    let error = queryErrors.get(key);
    if (!error) {
      error = signal<Error | undefined>(undefined);
      queryErrors.set(key, error);
    }
    return { value: () => [], hasValue: () => true, error };
  }
}));

import { RxDB } from '@aiao/rxdb';
import DesignerComponent from '../../designer.component';
import { DEFAULT_TRANSLATIONS, MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import { DesignerStateService } from '../../services/designer-state.service';

function mountDesigner() {
  TestBed.configureTestingModule({
    imports: [DesignerComponent],
    providers: [
      provideRouter([]),
      { provide: MODEL_DESIGNER_TRANSLATIONS, useValue: signal(DEFAULT_TRANSLATIONS) },
      {
        provide: RxDB,
        useValue: {
          versionManager: { history: () => ({ undoCount$: of(0), redoCount$: of(0) }) },
          entityManager: { mutations: vi.fn().mockResolvedValue([]) }
        }
      }
    ]
  });
  const fixture = TestBed.createComponent(DesignerComponent);
  fixture.detectChanges();
  return fixture;
}

/** DesignerStateService 是组件级 provider，只在组件注入器里 */
function designerState(fixture: ComponentFixture<DesignerComponent>): DesignerStateService {
  return fixture.debugElement.injector.get(DesignerStateService);
}

/**
 * `DesignerStateService.lastError` 曾经**写 7 处、读 0 处**：建实体 / 删实体 / 建关系 /
 * 建模型 / 复制模型 / 删模型 全部把失败原因写进这个 signal，而没有任何模板引用它。
 * 用户点了「+ 实体」，失败时看到的与什么都没发生**完全一样**。
 *
 * 与[缺陷台账 #3](../../../../../requirements/known-defects.md)（登录页 set 了
 * `$errorMessage` 但模板全文零引用）是同一个形状的第二次复发。
 */
describe('DesignerComponent 错误横幅', () => {
  it('lastError 为 null 时不渲染横幅', () => {
    const fixture = mountDesigner();
    expect(fixture.nativeElement.querySelector('[data-testid="designer-error"]')).toBeNull();
  });

  it('lastError 有值时把原文渲染出来', () => {
    const fixture = mountDesigner();
    designerState(fixture).lastError.set('Create entity failed: boom');
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector('[data-testid="designer-error"]');
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain('Create entity failed: boom');
  });

  it('模型列表分支（无 activeDesign）也渲染横幅 —— 建/复制/删模型三条失败路径都在这一侧', () => {
    const fixture = mountDesigner();
    const state = designerState(fixture);
    expect(state.modelDesign.activeDesign()).toBeFalsy();

    state.lastError.set('Copy model failed: boom');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('lib-model-list')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="designer-error"]').textContent).toContain(
      'Copy model failed: boom'
    );
  });

  it('run() 成功时清掉上一次的失败 —— 否则旧错误会挂在成功的操作上', async () => {
    const fixture = mountDesigner();
    const state = designerState(fixture);

    expect(await state.run('Create entity', () => Promise.reject(new Error('boom')))).toBe(false);
    expect(state.lastError()).toBe('Create entity failed: boom');

    expect(await state.run('Create entity', () => Promise.resolve())).toBe(true);
    expect(state.lastError()).toBeNull();

    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="designer-error"]')).toBeNull();
  });

  it('点关闭清空 lastError 并收起横幅', () => {
    const fixture = mountDesigner();
    const state = designerState(fixture);
    state.lastError.set('Delete entity failed: boom');
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-testid="designer-error-dismiss"]').click();
    fixture.detectChanges();

    expect(state.lastError()).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="designer-error"]')).toBeNull();
  });
});

/**
 * #21：活查询一旦 error，RxJS 语义下**订阅就此终止**——列表永远停在最后一帧。
 * 用户看到的是「建了实体但界面不更新」，而数据其实一直在库里，刷新就出来。
 *
 * 这是 [#3](../../../../../requirements/known-defects.md)（登录页 set 了 `$errorMessage`
 * 模板零引用）/ [#20](../../../../../requirements/known-defects.md)（`lastError` 写 7 处读 0 处）
 * 之后**同一形状的第三次**：错误被算出来了，没人读。
 */
describe('DesignerComponent 活查询失败横幅（#21）', () => {
  beforeEach(() => queryErrors.clear());

  it('活查询正常时不渲染横幅', () => {
    const fixture = mountDesigner();

    expect(designerState(fixture).queryError()).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="designer-error"]')).toBeNull();
  });

  it('实体活查询 error 时横幅上屏并带出原始 message', () => {
    const fixture = mountDesigner();
    failQuery('DesignEntity', new Error('changestream closed'));
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector('[data-testid="designer-error"]');
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain('Live query failed: changestream closed');
  });

  it('活查询失败的横幅不可关闭 —— 订阅已终止，关掉只会把永久故障藏起来', () => {
    const fixture = mountDesigner();
    failQuery('DesignEntity', new Error('changestream closed'));
    fixture.detectChanges();

    expect(designerState(fixture).bannerDismissible()).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="designer-error-dismiss"]')).toBeNull();
  });

  it('活查询失败优先于单次操作失败 —— 它是「后续每次操作都像失灵」的根因', async () => {
    const fixture = mountDesigner();
    const state = designerState(fixture);

    await state.run('Create entity', () => Promise.reject(new Error('boom')));
    expect(state.bannerError()).toBe('Create entity failed: boom');

    failQuery('DesignEntity', new Error('changestream closed'));
    fixture.detectChanges();

    expect(state.bannerError()).toBe('Live query failed: changestream closed');
  });

  it.each(['ModelDesign', 'DesignEntity', 'DesignProperty', 'DesignRelation', 'DesignIndex'])(
    '%s 活查询出错同样上屏 —— 缺口不只在实体那一条',
    entity => {
      const fixture = mountDesigner();
      failQuery(entity, new Error(`${entity} stream died`));
      fixture.detectChanges();

      expect(designerState(fixture).bannerError()).toBe(`Live query failed: ${entity} stream died`);
    }
  );
});
