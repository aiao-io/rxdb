import { Dialog } from '@angular/cdk/dialog';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogComponent } from '../../components/confirm-dialog/confirm-dialog.component';
import { MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import { ZH_TRANSLATIONS } from '../../i18n/zh';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';

describe('ConfirmDialogService', () => {
  let service: ConfirmDialogService;
  let openSpy: ReturnType<typeof vi.fn>;

  function setupDialog(closedValue: boolean | undefined) {
    openSpy = vi.fn(() => ({ closed: of(closedValue) }));
    TestBed.configureTestingModule({
      providers: [
        ConfirmDialogService,
        { provide: Dialog, useValue: { open: openSpy } },
        { provide: MODEL_DESIGNER_TRANSLATIONS, useValue: signal(ZH_TRANSLATIONS) }
      ]
    });
    service = TestBed.inject(ConfirmDialogService);
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('MUST resolve true when the dialog closes with true', async () => {
    setupDialog(true);
    const result = await service.confirm({ title: 'Delete', message: 'Sure?' });
    expect(result).toBe(true);
  });

  it('MUST resolve false when the dialog closes with false', async () => {
    setupDialog(false);
    const result = await service.confirm({ title: 'Delete', message: 'Sure?' });
    expect(result).toBe(false);
  });

  it('MUST resolve false when the dialog closes with undefined (backdrop/escape)', async () => {
    setupDialog(undefined);
    const result = await service.confirm({ title: 'Delete', message: 'Sure?' });
    expect(result).toBe(false);
  });

  it('MUST open ConfirmDialogComponent with the given options as DIALOG_DATA', async () => {
    setupDialog(true);
    await service.confirm({ title: 'Delete Entity', message: 'Sure?', confirmText: 'Yes', danger: true });

    expect(openSpy).toHaveBeenCalledWith(
      ConfirmDialogComponent,
      expect.objectContaining({
        data: {
          title: 'Delete Entity',
          message: 'Sure?',
          cancelText: '取消',
          confirmText: 'Yes',
          danger: true
        }
      })
    );
  });

  it('MUST localize default actions in the service injection context', async () => {
    setupDialog(true);
    await service.confirm({ title: '删除实体', message: '确定删除吗？', danger: true });

    expect(openSpy).toHaveBeenCalledWith(
      ConfirmDialogComponent,
      expect.objectContaining({
        data: {
          title: '删除实体',
          message: '确定删除吗？',
          cancelText: '取消',
          confirmText: '删除',
          danger: true
        }
      })
    );
  });

  it('MUST expose an accessible label and responsive maximum width', async () => {
    setupDialog(true);
    await service.confirm({ title: '删除实体', message: '确定删除吗？' });

    expect(openSpy).toHaveBeenCalledWith(
      ConfirmDialogComponent,
      expect.objectContaining({
        ariaLabel: '删除实体',
        maxWidth: 'calc(100vw - 2rem)'
      })
    );
  });
});
