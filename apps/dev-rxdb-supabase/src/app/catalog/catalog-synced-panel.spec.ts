import { RxDB, RxDBGrantSnapshot } from '@aiao/rxdb';
import type { CatalogItem } from '@aiao/rxdb-test/entities';
import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { describe, expect, it, vi } from 'vitest';
import { DemoSession } from '../demo-session';
import { CatalogItemEditor } from './catalog-item-editor';
import { CatalogItemHistory } from './catalog-item-history';
import { CatalogLocalWrites } from './catalog-local-writes';
import { CatalogRemoteState } from './catalog-remote-state';
import { CatalogSyncedPanel } from './catalog-synced-panel';

const angularMocks = vi.hoisted(() => ({ useFindAll: vi.fn() }));

vi.mock('@aiao/rxdb-angular', async importOriginal => {
  const actual = await importOriginal<typeof import('@aiao/rxdb-angular')>();
  return { ...actual, useFindAll: angularMocks.useFindAll };
});

type ListedItem = CatalogItem & { save: ReturnType<typeof vi.fn> };

function listedItem(id: string, tenantId: string, name: string): ListedItem {
  return {
    id,
    name,
    category: '数码',
    price: 299,
    cost: 120,
    visibility: 'public',
    tenantId,
    save: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
    reset: vi.fn()
  } as unknown as ListedItem;
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let round = 0; round < 3; round++) {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise(resolve => setTimeout(resolve));
  }
  fixture.detectChanges();
}

/**
 * @param options.tenants - 所在的租户
 * @param options.editable - 其中有 edit 的租户；缺省与所在的租户相同（都是管理员）
 *
 * @remarks 写入口出自引擎（US-234 阶段 B）：这里只给授权快照，能不能改由真的 `CatalogLocalWrites` 按 `CatalogItem` 的声明派生。
 */
async function renderPanel(options: { signedIn: boolean; tenants: string[]; editable?: string[] }) {
  const rxdb = { readOnly: false, entityManager: { instantiate: vi.fn() } };
  const editable = options.editable ?? options.tenants;
  const snapshot = RxDBGrantSnapshot.known(
    options.tenants.map(tenantId => ({
      scope: `tenant:${tenantId}`,
      permissions: editable.includes(tenantId) ? ['read', 'edit'] : ['read']
    })),
    'remote',
    new Date(0)
  );
  const own = listedItem('item-own', 'xinghe', '星河 X1 蓝牙耳机');
  const other = listedItem('item-other', 'jiguang', '极光便携充电宝');
  const items = signal([own, other]);
  angularMocks.useFindAll.mockReturnValue({ value: items });
  TestBed.configureTestingModule({
    imports: [CatalogSyncedPanel],
    providers: [
      CatalogLocalWrites,
      { provide: RxDB, useValue: rxdb },
      { provide: DemoSession, useValue: { signedIn: options.signedIn, prepared: undefined } },
      {
        provide: CatalogRemoteState,
        useValue: {
          $tenants: signal([
            { id: 'xinghe', name: '星河零售' },
            { id: 'jiguang', name: '极光百货' }
          ]),
          $grantSnapshot: signal(snapshot),
          $myTenantIds: signal(options.tenants),
          tenantName: (tenantId: string) => tenantId
        }
      }
    ]
  });
  TestBed.overrideComponent(CatalogSyncedPanel, {
    set: { imports: [FormsModule, CatalogItemEditor, CatalogItemHistory] }
  });
  const fixture = TestBed.createComponent(CatalogSyncedPanel);
  await settle(fixture);

  const root = fixture.nativeElement as HTMLElement;
  const row = (name: string) =>
    [...root.querySelectorAll<HTMLElement>('[data-testid="synced-item"]')].find(item =>
      item.textContent?.includes(name)
    )!;
  const button = (scope: ParentNode, name: string) =>
    [...scope.querySelectorAll('button')].find(element => element.textContent?.trim().startsWith(name)) ?? null;
  const byTestId = (id: string) => root.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!;
  const click = async (target: HTMLElement | null) => {
    target!.click();
    await settle(fixture);
  };
  return { fixture, root, row, button, byTestId, click, own, other, items };
}

describe('CatalogSyncedPanel：本机写入入口（US-034）', () => {
  // 撤销、重做与推送在顶栏（epic-016），访客时的原因由页面登记给顶栏，见 catalog.page.spec.ts
  it('AC#10 访客：新建、编辑、删除都不可用，说明只读', async () => {
    const { root, row, button, byTestId } = await renderPanel({ signedIn: false, tenants: [] });

    expect(byTestId('catalog-write-hint').textContent).toContain('访客只读');
    for (const name of ['编辑', '收回为内部', '删除']) {
      expect(button(row('星河 X1 蓝牙耳机'), name)?.disabled).toBe(true);
    }
    const form = byTestId('catalog-create-form');
    expect(
      [...form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')].every(f => f.disabled)
    ).toBe(true);
    expect(button(form, '新建')?.disabled).toBe(true);
    expect(root.querySelector('app-catalog-item-editor')).not.toBeNull();
  });

  it('不在任何租户里的登录身份：写入口不可用，提示先加入租户', async () => {
    const { row, button, byTestId } = await renderPanel({ signedIn: true, tenants: [] });

    expect(byTestId('catalog-write-hint').textContent).toContain('加入租户');
    expect(button(row('星河 X1 蓝牙耳机'), '编辑')?.disabled).toBe(true);
  });

  it('租户成员：只有所在租户的商品能改，别的租户的商品不能改', async () => {
    const { row, button } = await renderPanel({ signedIn: true, tenants: ['xinghe'] });

    expect(['编辑', '收回为内部', '删除'].map(name => button(row('星河 X1 蓝牙耳机'), name)?.disabled)).toEqual([
      false,
      false,
      false
    ]);
    expect(['编辑', '收回为内部', '删除'].map(name => button(row('极光便携充电宝'), name)?.disabled)).toEqual([
      true,
      true,
      true
    ]);
  });

  // US-234 AC#12：Alice 是星河零售的管理员，加入极光百货当员工
  it('员工所在租户的商品：写入口不可点，标着「员工只读」，没有「历史」；管理员所在租户的商品照常能改', async () => {
    const { row, button } = await renderPanel({ signedIn: true, tenants: ['jiguang', 'xinghe'], editable: ['xinghe'] });
    const staffRow = row('极光便携充电宝');

    expect(['编辑', '收回为内部', '删除'].map(name => button(staffRow, name)?.disabled)).toEqual([true, true, true]);
    expect(button(staffRow, '编辑')?.title).toBe('员工只读');
    expect(staffRow.querySelector('[data-testid="synced-item-readonly"]')?.textContent?.trim()).toBe('员工只读');
    expect(button(staffRow, '历史')).toBeNull();
    expect(button(row('星河 X1 蓝牙耳机'), '编辑')?.disabled).toBe(false);
    expect(button(row('星河 X1 蓝牙耳机'), '历史')).not.toBeNull();
    expect(row('星河 X1 蓝牙耳机').querySelector('[data-testid="synced-item-readonly"]')).toBeNull();
  });

  it('新建表单的租户下拉只列有 edit 的租户', async () => {
    const { byTestId } = await renderPanel({ signedIn: true, tenants: ['jiguang', 'xinghe'], editable: ['xinghe'] });
    const tenant = byTestId('catalog-create-form').querySelector<HTMLSelectElement>('select[name="tenant"]')!;

    expect([...tenant.options].map(option => option.value)).toEqual(['xinghe']);
    expect(tenant.disabled).toBe(false);
  });

  it('只当员工：说明员工只读，新建不可用', async () => {
    const { byTestId, button } = await renderPanel({ signedIn: true, tenants: ['jiguang'], editable: [] });

    expect(byTestId('catalog-write-hint').textContent).toContain('员工只读');
    expect(button(byTestId('catalog-create-form'), '新建')?.disabled).toBe(true);
  });

  it('US-229 变更历史的入口只给能编辑这件商品的成员：访客与别的租户的成员都看不到', async () => {
    const member = await renderPanel({ signedIn: true, tenants: ['xinghe'] });
    expect(member.button(member.row('星河 X1 蓝牙耳机'), '历史')).not.toBeNull();
    expect(member.button(member.row('极光便携充电宝'), '历史')).toBeNull();
    TestBed.resetTestingModule();

    const visitor = await renderPanel({ signedIn: false, tenants: [] });
    expect(visitor.root.querySelectorAll('[data-testid="synced-item"] button')).not.toHaveLength(0);
    expect(visitor.button(visitor.row('星河 X1 蓝牙耳机'), '历史')).toBeNull();
  });

  it('面板里不再有自己的推拉、撤销按钮与被拒清单：它们在顶栏和同步中心；规则提示指向顶栏的「拉取」', async () => {
    const { root } = await renderPanel({ signedIn: true, tenants: ['xinghe'] });

    for (const id of ['catalog-undo', 'catalog-redo', 'catalog-push', 'catalog-sync']) {
      expect(root.querySelector(`[data-testid="${id}"]`)).toBeNull();
    }
    expect(root.querySelector('app-sync-rejections-panel')).toBeNull();
  });

  it('编辑：打开本机的编辑框，保存后存进本机并关上', async () => {
    const { row, button, click, root, own } = await renderPanel({ signedIn: true, tenants: ['xinghe'] });

    await click(button(row('星河 X1 蓝牙耳机'), '编辑'));
    const dialog = root.querySelector('app-catalog-item-editor dialog') as HTMLDialogElement;
    expect(dialog.querySelector('h3')?.textContent).toBe('编辑本机商品');
    const name = dialog.querySelector<HTMLInputElement>('input[name="name"]')!;
    name.value = '星河 X1 Pro';
    name.dispatchEvent(new Event('input'));
    await click(button(dialog, '保存'));

    expect(own.save).toHaveBeenCalledTimes(1);
    expect(own.name).toBe('星河 X1 Pro');
    expect(dialog.open).toBe(false);
  });

  it('编辑期间这件商品被同步移出了本机：保存不写本机，框不关，原因显示在框里', async () => {
    const { fixture, row, button, click, root, own, other, items } = await renderPanel({
      signedIn: true,
      tenants: ['xinghe']
    });

    await click(button(row('星河 X1 蓝牙耳机'), '编辑'));
    const dialog = root.querySelector('app-catalog-item-editor dialog') as HTMLDialogElement;
    items.set([other]);
    await settle(fixture);
    await click(button(dialog, '保存'));

    expect(own.save).not.toHaveBeenCalled();
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('已经不在本机');
  });

  // 与服务端面板同口径：上一次操作的失败原因不带进下一次打开的编辑框
  it('取消之后再打开编辑框：上一次没保存的原因不再显示', async () => {
    const { fixture, row, button, click, root, own, other, items } = await renderPanel({
      signedIn: true,
      tenants: ['xinghe']
    });
    await click(button(row('星河 X1 蓝牙耳机'), '编辑'));
    const dialog = root.querySelector('app-catalog-item-editor dialog') as HTMLDialogElement;
    items.set([other]);
    await settle(fixture);
    await click(button(dialog, '保存'));
    await click(button(dialog, '取消'));

    items.set([own, other]);
    await settle(fixture);
    await click(button(row('星河 X1 蓝牙耳机'), '编辑'));

    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('[role="alert"]')).toBeNull();
  });
});
