import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { CodePreviewComponent } from '../../components/code-preview/code-preview.component';
import { DEFAULT_TRANSLATIONS, MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';

describe('CodePreviewComponent client package commands', () => {
  it('edits the package name and emits an archive command', () => {
    TestBed.configureTestingModule({
      imports: [CodePreviewComponent],
      providers: [{ provide: MODEL_DESIGNER_TRANSLATIONS, useValue: signal(DEFAULT_TRANSLATIONS) }]
    });
    const fixture = TestBed.createComponent(CodePreviewComponent);
    const archive = vi.fn();
    fixture.componentInstance.archivePackage.subscribe(archive);
    fixture.componentRef.setInput('isOpen', true);
    fixture.componentRef.setInput('files', [{ path: 'index.js', content: 'export {}' }]);
    fixture.componentRef.setInput('packageName', '@acme/blog-rxdb');
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('[data-testid="client-package-name"]') as HTMLInputElement;
    const button = fixture.nativeElement.querySelector('[data-testid="client-package-archive"]') as HTMLButtonElement;

    expect(input.value).toBe('@acme/blog-rxdb');
    button.click();
    expect(archive).toHaveBeenCalledOnce();
  });

  it('emits an explicit publish command and shows the confirmed version', () => {
    TestBed.configureTestingModule({
      imports: [CodePreviewComponent],
      providers: [{ provide: MODEL_DESIGNER_TRANSLATIONS, useValue: signal(DEFAULT_TRANSLATIONS) }]
    });
    const fixture = TestBed.createComponent(CodePreviewComponent);
    const publish = vi.fn();
    fixture.componentInstance.publishPackage.subscribe(publish);
    fixture.componentRef.setInput('isOpen', true);
    fixture.componentRef.setInput('files', [{ path: 'index.js', content: 'export {}' }]);
    fixture.componentRef.setInput('packageVersion', '1.1.0');
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('[data-testid="client-package-publish"]') as HTMLButtonElement;
    expect(fixture.nativeElement.textContent).toContain('1.1.0');
    button.click();
    expect(publish).toHaveBeenCalledOnce();
  });
});
