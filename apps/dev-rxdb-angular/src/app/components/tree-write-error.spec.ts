import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TreeWriteError } from './tree-write-error';

const render = (message: string | null) => {
  const fixture = TestBed.createComponent(TreeWriteError);
  fixture.componentRef.setInput('message', message);
  fixture.detectChanges();
  return fixture;
};

describe('TreeWriteError', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('message 为空不渲染', () => {
    const fixture = render(null);

    expect(fixture.nativeElement.querySelector('[data-testid="tree-write-error"]')).toBeNull();
  });

  it('渲染 div.alert.alert-error，带 role="alert" 与 data-testid，文案原样显示', () => {
    const fixture = render('新建失败：唯一索引冲突');

    const alert: HTMLElement | null = fixture.nativeElement.querySelector('[data-testid="tree-write-error"]');
    expect(alert).not.toBeNull();
    expect(alert?.tagName).toBe('DIV');
    expect(alert?.classList.contains('alert')).toBe(true);
    expect(alert?.classList.contains('alert-error')).toBe(true);
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toContain('新建失败：唯一索引冲突');
  });

  it('关闭按钮是带 aria-label 的原生 button，点击发出 closed', () => {
    const fixture = render('删除失败：x');
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);

    const button: HTMLButtonElement | null = fixture.nativeElement.querySelector('button');
    expect(button?.getAttribute('aria-label')).toBe('关闭错误提示');
    expect(button?.type).toBe('button');
    button?.click();

    expect(closed).toHaveBeenCalledOnce();
  });

  it('message 变回 null 后提示消失', () => {
    const fixture = render('删除失败：x');

    fixture.componentRef.setInput('message', null);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="tree-write-error"]')).toBeNull();
  });
});
