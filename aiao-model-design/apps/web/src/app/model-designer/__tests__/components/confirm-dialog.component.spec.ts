import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConfirmDialogComponent,
  type ConfirmDialogData
} from '../../components/confirm-dialog/confirm-dialog.component';

function renderComponent(data: ConfirmDialogData) {
  const close = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: DIALOG_DATA, useValue: data },
      { provide: DialogRef, useValue: { close } }
    ]
  });
  const fixture = TestBed.createComponent(ConfirmDialogComponent);
  fixture.detectChanges();
  return { close, fixture };
}

describe('ConfirmDialogComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('MUST render a visible CDK surface without DaisyUI modal state classes', () => {
    const { fixture } = renderComponent({
      title: '删除实体',
      message: '确定删除吗？',
      cancelText: '取消',
      confirmText: '删除',
      danger: true
    });
    const surface = fixture.nativeElement.querySelector('[data-testid="confirm-dialog-surface"]') as HTMLElement;

    expect(surface).not.toBeNull();
    expect(surface.classList).not.toContain('modal-box');
    expect(surface.classList).toContain('bg-base-100');
  });

  it('MUST render localized actions and close with the selected result', () => {
    const { close, fixture } = renderComponent({
      title: '删除实体',
      message: '确定删除吗？',
      cancelText: '取消',
      confirmText: '删除',
      danger: true
    });
    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;

    expect([...buttons].map(button => button.textContent?.trim())).toEqual(['取消', '删除']);
    expect([...buttons].every(button => button.classList.contains('min-h-11'))).toBe(true);

    buttons[0].click();
    buttons[1].click();
    expect(close).toHaveBeenNthCalledWith(1, false);
    expect(close).toHaveBeenNthCalledWith(2, true);
  });
});
