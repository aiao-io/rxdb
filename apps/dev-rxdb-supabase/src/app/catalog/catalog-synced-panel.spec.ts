import { RxDB, type PushResult } from '@aiao/rxdb';
import type { CatalogItem } from '@aiao/rxdb-test/entities';
import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
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

// 被拒清单读同步状态，单测不验它（见 sync-rejections-panel.spec.ts）
@Component({ selector: 'app-sync-rejections-panel', template: '' })
class RejectionsPanelStub {}

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

async function renderPanel(options: { signedIn: boolean; tenants: string[]; undo?: number; pending?: number }) {
  const history = {
    undoCount$: new BehaviorSubject(options.undo ?? 0),
    redoCount$: new BehaviorSubject(0),
    undo: vi.fn(() => Promise.resolve()),
    redo: vi.fn(() => Promise.resolve())
  };
  const push = vi.fn((): Promise<PushResult> =>
    Promise.resolve({ pushed: 1, rejected: 0, failed: 0, compacted: 0, originalCount: 1, failures: [] })
  );
  const rxdb = {
    entityManager: { instantiate: vi.fn() },
    syncManager: { push, pullRepository: vi.fn() },
    versionManager: { history: vi.fn(() => history), pushableCount$: new BehaviorSubject(options.pending ?? 0) }
  };
  const own = listedItem('item-own', 'xinghe', '星河 X1 蓝牙耳机');
  const other = listedItem('item-other', 'jiguang', '极光便携充电宝');
  angularMocks.useFindAll.mockReturnValue({ value: signal([own, other]) });
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
          $myTenantIds: signal(options.tenants),
          tenantName: (tenantId: string) => tenantId
        }
      }
    ]
  });
  TestBed.overrideComponent(CatalogSyncedPanel, {
    set: { imports: [FormsModule, CatalogItemEditor, CatalogItemHistory, RejectionsPanelStub] }
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
  return { fixture, root, row, button, byTestId, click, history, push, own };
}

describe('CatalogSyncedPanel：本机写入入口（US-034）', () => {
  it('AC#10 访客：新建、编辑、删除、撤销、重做与推送都不可用，说明只读', async () => {
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
    expect(['catalog-undo', 'catalog-redo', 'catalog-push'].map(id => byTestId(id).disabled)).toEqual([
      true,
      true,
      true
    ]);
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

  it('US-229 变更历史的入口只给能编辑这件商品的成员：访客与别的租户的成员都看不到', async () => {
    const member = await renderPanel({ signedIn: true, tenants: ['xinghe'] });
    expect(member.button(member.row('星河 X1 蓝牙耳机'), '历史')).not.toBeNull();
    expect(member.button(member.row('极光便携充电宝'), '历史')).toBeNull();
    TestBed.resetTestingModule();

    const visitor = await renderPanel({ signedIn: false, tenants: [] });
    expect(visitor.root.querySelectorAll('[data-testid="synced-item"] button')).not.toHaveLength(0);
    expect(visitor.button(visitor.row('星河 X1 蓝牙耳机'), '历史')).toBeNull();
  });

  it('撤销与推送按计数启用：点撤销走商品的历史，点推送走整机推送', async () => {
    const { byTestId, click, history, push, root } = await renderPanel({
      signedIn: true,
      tenants: ['xinghe'],
      undo: 2,
      pending: 1
    });

    expect(byTestId('catalog-undo').disabled).toBe(false);
    expect(byTestId('catalog-undo').textContent).toContain('2');
    expect(byTestId('catalog-redo').disabled).toBe(true);
    expect(byTestId('catalog-pending-count').textContent?.trim()).toBe('1');

    await click(byTestId('catalog-undo'));
    await click(byTestId('catalog-push'));

    expect(history.undo).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledTimes(1);
    expect(root.querySelector('[data-testid="catalog-write-notice"]')?.textContent).toContain('远端接受 1 条');
  });

  it('没有待推的修改时推送不可用', async () => {
    const { byTestId } = await renderPanel({ signedIn: true, tenants: ['xinghe'], pending: 0 });

    expect(byTestId('catalog-push').disabled).toBe(true);
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
});
