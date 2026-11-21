import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { configureServices } from '../testing/angular';
import { CONTENT_BROWSER, ContentActions, ContentBrowser } from './content-actions';
import { Toast } from './toast';

function setup() {
  const copyText = vi.fn<ContentBrowser['copyText']>(async () => undefined);
  const print = vi.fn<ContentBrowser['print']>(async () => undefined);
  const show = vi.fn();
  configureServices([
    ContentActions,
    { provide: CONTENT_BROWSER, useValue: { copyText, print } },
    { provide: Toast, useValue: { show } }
  ]);
  return { actions: TestBed.inject(ContentActions), copyText, print, show };
}

const content = { title: 'Document', paragraphs: ['first\nsecond'] };

describe('ContentActions', () => {
  it('复制完成之后才报告成功，等待期间拒绝重复操作', async () => {
    const { actions, copyText, show } = setup();
    let complete!: () => void;
    copyText.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          complete = resolve;
        })
    );
    const pending = actions.copy('actual text');
    expect(actions.busy()).toBe(true);
    expect(show).not.toHaveBeenCalled();
    await actions.copy('duplicate');
    expect(copyText).toHaveBeenCalledExactlyOnceWith('actual text');
    complete();
    await pending;
    expect(actions.busy()).toBe(false);
    expect(show).toHaveBeenCalledWith('Copied to clipboard');
  });

  it('拒绝剪贴板时保留错误且可重试，不弹假成功', async () => {
    const { actions, copyText, show } = setup();
    copyText.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'));
    await actions.copy('text');
    expect(actions.error()).toContain('Copy failed');
    expect(actions.error()).toContain('Permission denied');
    expect(show).not.toHaveBeenCalledWith('Copied to clipboard');
    expect(show).toHaveBeenLastCalledWith('Copy failed: Permission denied');
    await actions.copy('text');
    expect(actions.error()).toBe('');
    expect(show).toHaveBeenCalledTimes(2);
  });

  it('后一次失败立即替换上一次成功提示', async () => {
    const { actions, copyText, show } = setup();
    await actions.copy('first');
    copyText.mockRejectedValueOnce(new Error('Denied'));
    await actions.copy('second');
    expect(show.mock.calls.map(call => call[0])).toEqual(['Copied to clipboard', 'Copy failed: Denied']);
  });

  it('打印传递当前内容与取消信号，不声称打印成功', async () => {
    const { actions, print, show } = setup();
    await actions.print(content);
    expect(print).toHaveBeenCalledWith(content, expect.any(AbortSignal));
    expect(show).not.toHaveBeenCalled();
    expect(actions.busy()).toBe(false);
  });

  it('打印错误可读，非 Error 异常也不报成功', async () => {
    const { actions, print, show } = setup();
    print.mockRejectedValueOnce(new Error('Cannot open print dialog'));
    await actions.print(content);
    expect(actions.error()).toBe('Print failed: Cannot open print dialog');
    print.mockRejectedValueOnce('unavailable');
    await actions.print(content);
    expect(actions.error()).toBe('Print failed: unavailable');
    expect(show).toHaveBeenLastCalledWith('Print failed: unavailable');
  });

  it('窗口销毁取消在途打印，并忽略迟到的复制成功或失败', async () => {
    const { actions, copyText, show } = setup();
    let complete!: () => void;
    copyText.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          complete = resolve;
        })
    );
    const pending = actions.copy('text');
    TestBed.resetTestingModule();
    complete();
    await pending;
    expect(show).not.toHaveBeenCalled();
    await actions.print(content);
  });

  it('销毁传给打印的信号，迟到异常不写界面', async () => {
    const { actions, print } = setup();
    let fail!: (error: Error) => void;
    print.mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          fail = reject;
        })
    );
    const pending = actions.print(content);
    const call = print.mock.calls[0];
    expect(call[1].aborted).toBe(false);
    TestBed.resetTestingModule();
    expect(call[1].aborted).toBe(true);
    fail(new Error('closed'));
    await pending;
    expect(actions.error()).toBe('');
  });
});
