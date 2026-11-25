import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CatalogItemEditor, type CatalogItemEdit } from './catalog-item-editor';
import type { CatalogRemoteItem } from './catalog-remote';

const item: CatalogRemoteItem = {
  id: 'item-1',
  name: '星河 X1 蓝牙耳机',
  category: '数码',
  price: 299,
  cost: 120,
  visibility: 'public',
  tenantId: 'xinghe'
};

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

async function openEditor(target: CatalogRemoteItem = item) {
  TestBed.configureTestingModule({ imports: [CatalogItemEditor] });
  const fixture = TestBed.createComponent(CatalogItemEditor);
  const saved: CatalogItemEdit[] = [];
  fixture.componentInstance.save.subscribe(edit => saved.push(edit));
  await settle(fixture);
  fixture.componentInstance.open(target);
  await settle(fixture);

  const root = fixture.nativeElement as HTMLElement;
  const dialog = root.querySelector('dialog') as HTMLDialogElement;
  /** 标签包着输入框：按标签文字找 */
  const field = (label: string) =>
    [...root.querySelectorAll('label')]
      .find(element => element.querySelector('.fieldset-legend')?.textContent?.trim() === label)
      ?.querySelector<HTMLInputElement | HTMLSelectElement>('input, select') ?? null;
  const button = (name: string) =>
    [...root.querySelectorAll('button')].find(element => element.textContent?.trim() === name) ?? null;
  const type = async (label: string, value: string) => {
    const control = field(label)!;
    control.value = value;
    control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input'));
    await settle(fixture);
  };
  const click = async (name: string) => {
    button(name)!.click();
    await settle(fixture);
  };
  return { fixture, root, dialog, saved, field, button, type, click };
}

describe('CatalogItemEditor', () => {
  it('按服务端现值回填，以模态打开', async () => {
    const { dialog, field } = await openEditor();

    expect(dialog.open).toBe(true);
    expect(field('名称')?.value).toBe('星河 X1 蓝牙耳机');
    expect(field('分类')?.value).toBe('数码');
    expect(field('售价')?.value).toBe('299');
    expect(field('成本价')?.value).toBe('120');
  });

  it('保存交出这一行的 id 与改后的内容，名称去掉首尾空格', async () => {
    const { saved, type, click } = await openEditor();

    await type('名称', '  星河 X1 蓝牙耳机（新款） ');
    await type('分类', '图书');
    await type('售价', '279.5');
    await type('成本价', '110');
    await click('保存');

    expect(saved).toEqual([
      { id: 'item-1', changes: { name: '星河 X1 蓝牙耳机（新款）', category: '图书', price: 279.5, cost: 110 } }
    ]);
  });

  it('名称为空、售价或成本价为空或为负时不能保存', async () => {
    const { type, button } = await openEditor();

    await type('名称', '   ');
    expect(button('保存')?.disabled).toBe(true);

    await type('名称', '星河 X1 蓝牙耳机');
    await type('售价', '');
    expect(button('保存')?.disabled).toBe(true);

    await type('售价', '299');
    await type('成本价', '-1');
    expect(button('保存')?.disabled).toBe(true);

    await type('成本价', '120');
    expect(button('保存')?.disabled).toBe(false);
  });

  it('服务端没有成本价的商品，要先填上才能保存', async () => {
    const { field, button } = await openEditor({ ...item, cost: null });

    expect(field('成本价')?.value).toBe('');
    expect(button('保存')?.disabled).toBe(true);
  });

  it('取消就关上，不交出修改，表单也不留在页面上', async () => {
    const { dialog, root, saved, click } = await openEditor();

    await click('取消');

    expect(dialog.open).toBe(false);
    expect(saved).toEqual([]);
    expect(root.querySelector('form')).toBeNull();
  });

  it('面板写远端时不能再点保存，写入失败的原因显示在框里', async () => {
    const { fixture, root, button } = await openEditor();

    fixture.componentRef.setInput('busy', true);
    fixture.componentRef.setInput('error', '编辑失败：没有权限，或这一行已经不在了');
    await settle(fixture);

    expect(button('保存')?.disabled).toBe(true);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('没有权限');
  });

  it('面板写完远端后关上编辑框', async () => {
    const { fixture, dialog, root } = await openEditor();

    fixture.componentInstance.close();
    await settle(fixture);

    expect(dialog.open).toBe(false);
    expect(root.querySelector('form')).toBeNull();
  });
});
