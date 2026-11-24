// @vitest-environment jsdom
import '@angular/compiler';
import { DOCUMENT } from '@angular/common';
import { EnvironmentInjector, createComponent } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { FsNode } from '../../services/file-system';
import { FileOpener, OpenWithChoice } from '../../services/file-opener';
import { PopoverService } from '../../services/popover';
import { Toast } from '../../services/toast';
import { configureServices } from '../../testing/angular';
import { fileNode, folderNode } from '../../testing/nodes';
import { InfoPanel } from './info-panel';

function setup(
  node: FsNode,
  choices: readonly OpenWithChoice[] = [],
  setDefaultApp: ReturnType<typeof vi.fn> = vi.fn(async () => undefined)
) {
  const opener = {
    choices: vi.fn(() => choices),
    setDefaultApp
  };
  const popover = { close: vi.fn() };
  const toast = { show: vi.fn() };
  configureServices([
    { provide: FileOpener, useValue: opener },
    { provide: PopoverService, useValue: popover },
    { provide: Toast, useValue: toast }
  ]);
  /* 服务测试的假 DOM 不支持渲染，组件测试换回 jsdom 的真实 document。 */
  TestBed.overrideProvider(DOCUMENT, { useValue: document });
  /* TestBed.createComponent 会立刻跑第一轮变更检测，必填 input 来不及设；
     和生产里弹出层一样，先用 core 的 createComponent 建引用、设好 input 再手动检测。 */
  const host = document.createElement('div');
  const ref = createComponent(InfoPanel, {
    environmentInjector: TestBed.inject(EnvironmentInjector),
    hostElement: host
  });
  ref.setInput('node', node);
  ref.changeDetectorRef.detectChanges();
  return { host, ref, opener, popover, toast };
}

const pdfNode: FsNode = {
  name: 'report.pdf',
  path: ['Desktop', 'Docs', 'report.pdf'],
  kind: 'file',
  icon: 'f-pdf',
  k: 'PDF document',
  date: new Date(2026, 10, 24, 10, 30),
  bytes: 2048,
  size: '2 KB',
  hidden: false
};

const row = (host: HTMLElement, label: string): string | null =>
  [...host.querySelectorAll('dt')].find(element => element.textContent === label)?.nextElementSibling?.textContent ??
  null;

/** changeAll 的成功/失败回调在微任务里落定。 */
const settled = (): Promise<void> => new Promise(resolve => setTimeout(resolve));

describe('InfoPanel 显示简介（ADESK-US-212）', () => {
  it('显示名称、种类、大小、所在文件夹与修改时间', () => {
    const { host } = setup(pdfNode, [{ id: 'preview', name: 'Preview' }]);
    expect(host.textContent).toContain('report.pdf');
    expect(row(host, 'Kind')).toBe('PDF document');
    expect(row(host, 'Size')).toBe('2 KB');
    expect(row(host, 'Where')).toBe('/Desktop/Docs');
    expect(row(host, 'Modified')).toContain('Nov 24, 2026');
  });

  it('文件夹没有大小行，也没有打开方式区', () => {
    const { host } = setup(folderNode('Docs'));
    expect(host.querySelectorAll('dt').length).toBe(2);
    expect(host.querySelector('[data-ip-open-with]')).toBeNull();
  });

  it('打开方式下拉列出候选，默认应用是第一个', () => {
    const { host } = setup(fileNode('page.html'), [
      { id: 'safari', name: 'Safari' },
      { id: 'textedit', name: 'TextEdit' }
    ]);
    const select = host.querySelector('[data-ip-app]') as HTMLSelectElement;
    expect([...select.options].map(option => option.textContent)).toEqual(['Safari', 'TextEdit']);
    expect(select.value).toBe('safari');
  });

  it('Change All 把所选应用存成默认，提示后关面板', async () => {
    const node = fileNode('page.html');
    const { host, opener, popover, toast } = setup(node, [
      { id: 'safari', name: 'Safari' },
      { id: 'textedit', name: 'TextEdit' }
    ]);
    const select = host.querySelector('[data-ip-app]') as HTMLSelectElement;
    select.value = 'textedit';
    select.dispatchEvent(new Event('change'));
    host.querySelector('[data-ip-change-all]')!.dispatchEvent(new MouseEvent('click'));
    await settled();
    expect(opener.setDefaultApp).toHaveBeenCalledExactlyOnceWith(node, 'textedit');
    expect(toast.show).toHaveBeenCalledExactlyOnceWith('All “.html” files will now open with TextEdit.');
    expect(popover.close).toHaveBeenCalledExactlyOnceWith(true, 'command');
  });

  it('存默认失败时把原因报出来，面板不关', async () => {
    const node = fileNode('page.html');
    const { host, toast, popover } = setup(
      node,
      [
        { id: 'safari', name: 'Safari' },
        { id: 'textedit', name: 'TextEdit' }
      ],
      vi.fn(async () => {
        throw new Error('“Preview” can’t open page.html files.');
      })
    );
    host.querySelector('[data-ip-change-all]')!.dispatchEvent(new MouseEvent('click'));
    await settled();
    expect(toast.show).toHaveBeenCalledExactlyOnceWith('“Preview” can’t open page.html files.');
    expect(popover.close).not.toHaveBeenCalled();
  });

  it('关闭按钮关掉面板，焦点语义回到开启元素', () => {
    const { host, popover } = setup(pdfNode, [{ id: 'preview', name: 'Preview' }]);
    host.querySelector('[data-ip-close]')!.dispatchEvent(new MouseEvent('click'));
    expect(popover.close).toHaveBeenCalledExactlyOnceWith(true, 'escape');
  });
});
