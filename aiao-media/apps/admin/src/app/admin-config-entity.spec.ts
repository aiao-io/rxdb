import { MediaPromptTemplate } from '@aiao-media/domain';
import { RxDB, SyncType, type UUID } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { EntityListComponent, QueryTableComponent } from '@aiao/rxdb-model-angular';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { firstValueFrom, Subject } from 'rxjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// VTable 依赖 canvas，jsdom 里画不出来：只替换渲染引擎，列表 → 查询表格 → 实体表格的组件链与 RxDB 都是真实的。
vi.mock('@visactor/vtable', () => {
  type Row = Record<string, unknown>;
  type Handler = (event: Row) => void;
  class ListTable {
    readonly handlers = new Map<string, Handler[]>();
    records: Row[];
    columns: Row[];
    get colCount(): number {
      return this.columns.length + 1;
    }
    get rowCount(): number {
      return this.records.length + 1;
    }
    constructor(
      readonly container: HTMLElement,
      readonly options: Row
    ) {
      this.records = (options['records'] as Row[] | undefined) ?? [];
      this.columns = (options['columns'] as Row[] | undefined) ?? [];
    }
    on(type: string, handler: Handler): void {
      this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
    }
    emit(type: string, event: Row): void {
      for (const handler of this.handlers.get(type) ?? []) handler(event);
    }
    setRecords(records: Row[]): void {
      this.records = records;
    }
    updateColumns(columns: Row[]): void {
      this.columns = columns;
    }
    getRecordByCell(_col: number, row: number): Row | undefined {
      return this.records[row - 1];
    }
    getColWidth(): number {
      return 120;
    }
    getRowHeight(): number {
      return 40;
    }
    getSelectedCellInfos(): Row[][] {
      return [];
    }
    getCellInfo(col: number, row: number): Row {
      const field = String(this.columns[col - 1]?.['field'] ?? '');
      return { field, value: this.records[row - 1]?.[field] ?? '', cellType: 'text' };
    }
    getCellRect(): { x: number; y: number; width: number; height: number } {
      return { x: 0, y: 0, width: 100, height: 32 };
    }
    getElement(): HTMLElement {
      return this.container;
    }
    setColWidth(): void {
      // 替身：不做布局
    }
    updateTheme(): void {
      // 替身：主题不影响断言
    }
    updateSortState(): void {
      // 替身：排序图标不影响断言
    }
    renderWithRecreateCells(): void {
      // 替身：没有单元格可重建
    }
    resize(): void {
      // 替身：不做布局
    }
    release(): void {
      // 替身：没有画布资源
    }
    setCellSwitchState(): void {
      // 替身：开关视觉状态不影响断言
    }
    changeCellValue(): void {
      // 替身：回写由组件输出断言
    }
  }
  return {
    ListTable,
    register: { editor: (): void => undefined },
    themes: { DEFAULT: { extends: (theme: object): object => ({ ...theme }) } }
  };
});
vi.mock('@visactor/vtable-editors', () => ({
  InputEditor: class {},
  TextAreaEditor: class {},
  ListEditor: class {
    onEnd(): void {
      // 替身：没有编辑器状态
    }
  }
}));

interface FakeTable {
  readonly columns: Record<string, unknown>[];
  emit(type: string, event: Record<string, unknown>): void;
}

const workspaceA = '10000000-0000-4000-8000-0000000000a1' as UUID;
const workspaceB = '10000000-0000-4000-8000-0000000000b1' as UUID;
const userId = '10000000-0000-4000-8000-0000000000a2' as UUID;

/** 与配置页相同的工作区固定条件。 */
const workspaceQuery = (workspaceId: UUID) => ({
  combinator: 'and' as const,
  rules: [{ field: 'workspaceId', operator: '=' as const, value: workspaceId }]
});

describe('Admin 配置实体：真实 rxdb-entity-list / 详情 / 表单 / 表格', () => {
  let rxdb: RxDB;

  const repository = () => rxdb.entityManager.getRepository(MediaPromptTemplate);
  const allTemplates = () => firstValueFrom(repository().findAll({ where: { combinator: 'and', rules: [] } }));

  async function seed(workspaceId: UUID, key: string, title = key): Promise<MediaPromptTemplate> {
    return repository().create(
      new MediaPromptTemplate({ workspaceId, branchId: 'main', key, title, prompt: `生成${title}`, tags: [] })
    );
  }

  async function renderList(options: {
    workspaceId: UUID;
    fixedFormData?: Record<string, unknown>;
  }): Promise<ComponentFixture<EntityListComponent>> {
    const fixture = TestBed.createComponent(EntityListComponent);
    fixture.componentRef.setInput('namespace', 'public');
    fixture.componentRef.setInput('name', 'MediaPromptTemplate');
    fixture.componentRef.setInput('fixedQuery', workspaceQuery(options.workspaceId));
    if (options.fixedFormData) fixture.componentRef.setInput('fixedFormData', options.fixedFormData);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    return fixture;
  }

  const recordKeys = (fixture: ComponentFixture<EntityListComponent>): string[] =>
    fixture.componentInstance
      .tableRecords()
      .map(record => String(record['key']))
      .sort();

  const tableOf = (fixture: ComponentFixture<EntityListComponent>): FakeTable =>
    fixture.debugElement.query(By.directive(QueryTableComponent)).componentInstance
      .tableInstance as unknown as FakeTable;

  const buttonIn = (root: ParentNode, name: string): HTMLButtonElement | undefined =>
    [...root.querySelectorAll('button')].find(item => item.textContent?.trim() === name);

  /** 按 fieldset 的 legend 找到表单控件。 */
  const control = (root: ParentNode, legend: string): HTMLInputElement | HTMLTextAreaElement => {
    const fieldset = [...root.querySelectorAll('fieldset')].find(
      item => item.querySelector('legend')?.textContent?.replaceAll('*', '').trim() === legend
    );
    const element = fieldset?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
    if (!element) throw new Error(`表单里没有「${legend}」字段`);
    return element;
  };

  const fill = (root: ParentNode, legend: string, value: string): void => {
    const element = control(root, legend);
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const openCreateDialog = async (fixture: ComponentFixture<EntityListComponent>): Promise<HTMLElement> => {
    buttonIn(fixture.nativeElement as HTMLElement, '+ 新增')?.click();
    await vi.waitFor(() => expect(document.querySelector('rxdb-entity-detail')).not.toBeNull());
    await fixture.whenStable();
    return document.querySelector<HTMLElement>('rxdb-entity-detail')!;
  };

  beforeAll(async () => {
    // 后台 test-setup 在 jsdom 里装了只够摘要桩用的 crypto；RxDB 的 uuid v7 需要真实 getRandomValues。
    vi.stubGlobal('crypto', webcrypto);
    // PGlite 把数据目录打包成 File/Blob 再读 arrayBuffer()；jsdom 的 File/Blob 没有该方法。
    vi.stubGlobal('Blob', NodeBlob);
    vi.stubGlobal('File', NodeFile);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {
          // jsdom 没有布局
        }
        unobserve(): void {
          // jsdom 没有布局
        }
        disconnect(): void {
          // jsdom 没有布局
        }
      }
    );
    rxdb = new RxDB({
      dbName: `admin-config-entity-${Date.now()}`,
      context: { userId },
      entities: [MediaPromptTemplate],
      sync: { type: SyncType.None, local: { adapter: 'pglite' } }
    });
    rxdb.use(rxDBPluginHistory);
    rxdb.adapter('pglite', database => new RxDBAdapterPGlite(database, { store: 'memory' }));
    await rxdb.connect('pglite');
  });

  afterAll(async () => {
    TestBed.resetTestingModule();
    await rxdb.destroy();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [EntityListComponent], providers: [{ provide: RxDB, useValue: rxdb }] });
  });

  afterEach(async () => {
    TestBed.resetTestingModule();
    for (const overlay of document.querySelectorAll('.cdk-overlay-container')) overlay.remove();
    for (const row of await allTemplates()) await repository().remove(row);
    vi.restoreAllMocks();
  });

  it('列表只读取当前工作区的模板，并按领域字段生成中文列', async () => {
    await seed(workspaceA, 'hero', '海报');
    await seed(workspaceA, 'poster', '封面');
    await seed(workspaceB, 'other', '别的工作区');

    const fixture = await renderList({ workspaceId: workspaceA });

    await vi.waitFor(() => expect(recordKeys(fixture)).toEqual(['hero', 'poster']));
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('媒体提示词模板');
    const columns = new Map(fixture.componentInstance.tableColumns().map(column => [column.field, column.title]));
    expect(columns.get('key')).toBe('标识');
    expect(columns.get('title')).toBe('标题');
    expect(columns.get('prompt')).toBe('提示词');
  });

  it('空工作区显示空态与新增入口，不借用其他工作区的记录', async () => {
    await seed(workspaceB, 'other');

    const fixture = await renderList({ workspaceId: workspaceA });
    const root = fixture.nativeElement as HTMLElement;

    await vi.waitFor(() => expect(fixture.componentInstance.isInitialLoading()).toBe(false));
    expect(fixture.componentInstance.tableRecords()).toEqual([]);
    const empty = root.querySelector('[role="status"][aria-label="暂无数据"]');
    expect(empty?.querySelector('[data-testid="entity-empty-state"]')?.textContent).toContain(
      '点击「+ 新增」开始录入第一条媒体提示词模板'
    );
    expect(buttonIn(root, '+ 新增')).toBeDefined();
  });

  it('首屏读取未返回时显示加载指示，返回后切换为数据', async () => {
    const pending = new Subject<MediaPromptTemplate[]>();
    vi.spyOn(repository(), 'findByCursor').mockReturnValue(pending.asObservable());

    const fixture = await renderList({ workspaceId: workspaceA });
    const root = fixture.nativeElement as HTMLElement;

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.componentInstance.isInitialLoading()).toBe(true);
      expect(root.querySelector('.loading-spinner')).not.toBeNull();
    });
    expect(root.querySelector('[aria-label="暂无数据"]')).toBeNull();

    pending.next([]);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.componentInstance.isInitialLoading()).toBe(false);
      expect(root.querySelector('.loading-spinner')).toBeNull();
    });
    expect(root.querySelector('[aria-label="暂无数据"]')).not.toBeNull();
  });

  /** 不填任何字段直接保存，返回错误面板。 */
  const saveEmptyForm = async (dialog: HTMLElement): Promise<Element> => {
    buttonIn(dialog, '保存')?.click();
    return vi.waitFor(() => {
      const panel = dialog.querySelector('[data-testid="entity-detail-errors"][role="alert"]');
      expect(panel?.textContent?.trim()).toBeTruthy();
      return panel!;
    });
  };

  it('新增表单：必填为空时保存被拒绝且不写入，错误可见', async () => {
    const fixture = await renderList({ workspaceId: workspaceA, fixedFormData: { workspaceId: workspaceA } });
    const dialog = await openCreateDialog(fixture);

    await saveEmptyForm(dialog);

    expect(await allTemplates()).toEqual([]);
    expect(document.querySelector('rxdb-entity-detail')).not.toBeNull();
  });

  // 领域元数据声明了 key / title / prompt 为 required：表单在提交前拦截，不再把空值打到存储层。
  it('新增表单：提交前就按字段提示必填项，不出现存储层原文', async () => {
    const fixture = await renderList({ workspaceId: workspaceA, fixedFormData: { workspaceId: workspaceA } });
    const dialog = await openCreateDialog(fixture);

    const errors = await saveEmptyForm(dialog);

    expect(errors.textContent).toContain('标识 是必填项');
    expect(errors.textContent).toContain('标题 是必填项');
    expect(errors.textContent).toContain('提示词 是必填项');
    expect(errors.textContent).not.toContain('保存失败');
  });

  it('新增表单：补齐字段后保存，工作区由固定数据带入，并回到列表', async () => {
    const fixture = await renderList({ workspaceId: workspaceA, fixedFormData: { workspaceId: workspaceA } });
    const dialog = await openCreateDialog(fixture);

    fill(dialog, '标识', 'hero');
    fill(dialog, '标题', '海报');
    fill(dialog, '提示词', '生成海报');
    buttonIn(dialog, '保存')?.click();

    await vi.waitFor(async () => expect((await allTemplates()).map(row => row.key)).toEqual(['hero']));
    const [saved] = await allTemplates();
    expect(saved.workspaceId).toBe(workspaceA);
    expect(saved.title).toBe('海报');
    expect(saved.prompt).toBe('生成海报');
    await vi.waitFor(() => expect(document.querySelector('rxdb-entity-detail')).toBeNull());
    await vi.waitFor(() => expect(recordKeys(fixture)).toEqual(['hero']));
  });

  it('格式错误的工作区标识被表单拒绝，不进入数据库', async () => {
    const fixture = await renderList({ workspaceId: workspaceA });
    const dialog = await openCreateDialog(fixture);

    fill(dialog, '工作区', 'not-a-workspace');
    fill(dialog, '标识', 'hero');
    fill(dialog, '标题', '海报');
    fill(dialog, '提示词', '生成海报');
    buttonIn(dialog, '保存')?.click();

    const errors = await vi.waitFor(() => {
      const panel = dialog.querySelector('[data-testid="entity-detail-errors"]');
      expect(panel?.textContent).toContain('工作区');
      return panel!;
    });
    expect(errors.textContent).toMatch(/格式|UUID/);
    expect(await allTemplates()).toEqual([]);
  });

  it('同一工作区重复的标识被存储层拒绝时，失败原因可见且原记录不变', async () => {
    await seed(workspaceA, 'hero', '原标题');
    const fixture = await renderList({ workspaceId: workspaceA, fixedFormData: { workspaceId: workspaceA } });
    await vi.waitFor(() => expect(recordKeys(fixture)).toEqual(['hero']));
    const dialog = await openCreateDialog(fixture);

    fill(dialog, '标识', 'hero');
    fill(dialog, '标题', '重复的模板');
    fill(dialog, '提示词', '生成重复');
    buttonIn(dialog, '保存')?.click();

    await vi.waitFor(() =>
      expect(dialog.querySelector('[data-testid="entity-detail-errors"][role="alert"]')?.textContent?.trim()).not.toBe(
        ''
      )
    );
    const rows = await allTemplates();
    expect(rows.map(row => [row.key, row.title])).toEqual([['hero', '原标题']]);
    expect(document.querySelector('rxdb-entity-detail')).not.toBeNull();
  });

  it('行内编辑经表格事件链写回真实 RxDB', async () => {
    const template = await seed(workspaceA, 'hero', '旧标题');
    const fixture = await renderList({ workspaceId: workspaceA });
    await vi.waitFor(() => expect(recordKeys(fixture)).toEqual(['hero']));

    const table = tableOf(fixture);
    const titleColumn = table.columns.findIndex(column => column['field'] === 'title') + 1;
    expect(titleColumn).toBeGreaterThan(0);
    table.emit('change_cell_value', { col: titleColumn, row: 1, changedValue: '新标题' });

    await vi.waitFor(async () => {
      const rows = await allTemplates();
      expect(rows.find(row => row.id === template.id)?.title).toBe('新标题');
    });
  });
});
