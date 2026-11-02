import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserWorkbench } from './browser-workbench';

const mocks = vi.hoisted(() => ({ mount: vi.fn(), dispose: vi.fn(), change: vi.fn(), cursor: vi.fn() }));
vi.mock('@aiao/browser-workbench', () => ({ mountWorkbench: mocks.mount }));
let editor: { update(value: string, language: string): void; dispose(): void };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mount.mockImplementation((host, _options, mountEditor) => {
    const element = document.createElement('div');
    host.append(element);
    editor = mountEditor(element, {
      value: 'initial',
      language: 'plaintext',
      onChange: mocks.change,
      onCursor: mocks.cursor
    });
    return {
      dispose: () => {
        editor.dispose();
        mocks.dispose();
      }
    };
  });
});

describe('BrowserWorkbench Angular binding', () => {
  it('mounts the existing editor, updates values and disposes the workbench', async () => {
    const fixture = TestBed.createComponent(BrowserWorkbench);
    fixture.componentRef.setInput('options', { initialProjectId: 'fixture' });
    fixture.detectChanges();
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.cm-content')?.textContent).toBe('initial');
    editor.update('changed', 'plaintext');
    expect(host.querySelector('.cm-content')?.textContent).toBe('changed');
    host.querySelector('.cm-content')?.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    expect(mocks.cursor).toHaveBeenCalledWith(1, 1);
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { getData: () => 'pasted', files: [] } });
    host.querySelector('.cm-content')?.dispatchEvent(paste);
    expect(mocks.change).toHaveBeenCalledWith(expect.stringContaining('pasted'));
    expect(mocks.mount.mock.calls[0][1]).toEqual({ initialProjectId: 'fixture' });
    fixture.destroy();
    expect(mocks.dispose).toHaveBeenCalledOnce();
  });

  it('does not start browser workers during server rendering', () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
    const fixture = TestBed.createComponent(BrowserWorkbench);
    fixture.detectChanges();
    expect(mocks.mount).not.toHaveBeenCalled();
    fixture.destroy();
  });
});
