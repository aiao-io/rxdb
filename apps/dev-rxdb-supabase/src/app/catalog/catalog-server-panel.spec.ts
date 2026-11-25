import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoSession } from '../demo-session';
import type { CatalogRemoteItem } from './catalog-remote';
import { CatalogRemoteState } from './catalog-remote-state';
import { CatalogServerPanel } from './catalog-server-panel';

const remote = vi.hoisted(() => ({
  createItem: vi.fn(),
  deleteItem: vi.fn(),
  fetchTenantItems: vi.fn(),
  joinTenant: vi.fn(),
  leaveTenant: vi.fn(),
  setItemVisibility: vi.fn(),
  updateItem: vi.fn()
}));

vi.mock('./catalog-remote', () => remote);

const client = {};
const item: CatalogRemoteItem = {
  id: 'item-1',
  name: '星河 X1 蓝牙耳机',
  category: '数码',
  price: 299,
  cost: 120,
  visibility: 'public',
  tenantId: 'xinghe'
};

/** 远端的读写都是替身返回的 promise：多等几轮，让它们落地后的变更检测跑完 */
async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let round = 0; round < 3; round++) {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise(resolve => setTimeout(resolve));
  }
  fixture.detectChanges();
}

async function renderPanel() {
  TestBed.configureTestingModule({
    imports: [CatalogServerPanel],
    providers: [
      { provide: DemoSession, useValue: { signedIn: true, prepared: { client } } },
      {
        provide: CatalogRemoteState,
        useValue: {
          $tenants: signal([{ id: 'xinghe', name: '星河零售' }]),
          $myTenantIds: signal(['xinghe']),
          tenantName: (tenantId: string) => (tenantId === 'xinghe' ? '星河零售' : tenantId),
          refresh: vi.fn()
        }
      }
    ]
  });
  const fixture = TestBed.createComponent(CatalogServerPanel);
  await settle(fixture);

  const root = fixture.nativeElement as HTMLElement;
  const row = () => root.querySelector<HTMLElement>('[data-testid="server-item"]')!;
  const dialog = () => root.querySelector('dialog') as HTMLDialogElement;
  const button = (scope: HTMLElement, name: string) =>
    [...scope.querySelectorAll('button')].find(element => element.textContent?.trim() === name) ?? null;
  const priceInput = () =>
    [...dialog().querySelectorAll('label')]
      .find(label => label.querySelector('.fieldset-legend')?.textContent?.trim() === '售价')
      ?.querySelector('input') ?? null;
  const click = async (target: HTMLElement | null) => {
    target!.click();
    await settle(fixture);
  };
  return { fixture, root, row, dialog, button, priceInput, click };
}

describe('CatalogServerPanel：编辑商品', () => {
  beforeEach(() => {
    for (const fn of Object.values(remote)) fn.mockReset();
    remote.fetchTenantItems.mockResolvedValue([item]);
  });

  it('每件商品列出所属租户、售价与成本价，都能编辑', async () => {
    const { row, button } = await renderPanel();

    expect(row().textContent).toContain('星河零售 · ¥299 · 成本 ¥120');
    expect(button(row(), '编辑')).not.toBeNull();
  });

  it('点「编辑」以这件商品在服务端的现值打开编辑框', async () => {
    const { row, dialog, button, priceInput, click } = await renderPanel();

    await click(button(row(), '编辑'));

    expect(dialog().open).toBe(true);
    expect(priceInput()?.value).toBe('299');
  });

  it('保存：按 id 写回服务端，关上编辑框，重新列出商品，提示去同步', async () => {
    remote.updateItem.mockResolvedValue(undefined);
    const { fixture, root, row, dialog, button, priceInput, click } = await renderPanel();

    await click(button(row(), '编辑'));
    priceInput()!.value = '279';
    priceInput()!.dispatchEvent(new Event('input'));
    await settle(fixture);
    await click(button(dialog(), '保存'));

    expect(remote.updateItem).toHaveBeenCalledWith(client, 'item-1', {
      name: '星河 X1 蓝牙耳机',
      category: '数码',
      price: 279,
      cost: 120
    });
    expect(dialog().open).toBe(false);
    expect(remote.fetchTenantItems).toHaveBeenCalledTimes(2);
    expect(root.querySelector('[role="status"]')?.textContent).toContain(
      '「星河 X1 蓝牙耳机」已修改。去点「同步」看本机数据怎么变。'
    );
  });

  // 比如在别的标签页退出了这个租户：RLS 拦下，一行都没改到
  it('写回失败：编辑框不关，失败原因显示在框里', async () => {
    remote.updateItem.mockRejectedValue(new Error('编辑失败：没有权限，或这一行已经不在了'));
    const { row, dialog, button, click } = await renderPanel();

    await click(button(row(), '编辑'));
    await click(button(dialog(), '保存'));

    expect(dialog().open).toBe(true);
    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('没有权限');
  });
});
