import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { afterEach, describe, expect, it } from 'vitest';
import { CodeEditor } from '../code-editor.js';

@Component({
  imports: [CodeEditor, ReactiveFormsModule],
  template: '<ao-code-editor [formControl]="control" [value]="external()" language="plaintext" />'
})
class ReviewFormHost {
  readonly control = new FormControl('表单初值', { nonNullable: true });
  readonly external = signal('输入初值');
  readonly editor = viewChild.required(CodeEditor);
}

@Component({
  imports: [CodeEditor, FormsModule],
  template: '<ao-code-editor [(ngModel)]="model" [value]="external()" language="plaintext" />'
})
class ReviewNgModelHost {
  model = '模型初值';
  readonly external = signal('输入初值');
  readonly editor = viewChild.required(CodeEditor);
}

afterEach(() => TestBed.resetTestingModule());

describe('并行评审：表单绑定与 value 输入的公开优先级', () => {
  it('公开契约：ngModel 与 value 同用时，后到的输入仍以 ngModel 为准', async () => {
    await TestBed.configureTestingModule({ imports: [ReviewNgModelHost] }).compileComponents();
    const fixture = TestBed.createComponent(ReviewNgModelHost);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.componentInstance;
    expect(host.editor().view?.state.doc.toString()).toBe('模型初值');
    host.external.set('后到的输入');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host.model).toBe('模型初值');
    expect(host.editor().view?.state.doc.toString()).toBe('模型初值');
    fixture.destroy();
  });

  it('对照：仅 value 输入时仍同步外部文档', () => {
    const fixture = TestBed.createComponent(CodeEditor);
    fixture.componentRef.setInput('language', 'plaintext');
    fixture.componentRef.setInput('value', '输入初值');
    fixture.detectChanges();
    fixture.componentRef.setInput('value', '输入更新');
    fixture.detectChanges();
    expect(fixture.componentInstance.view?.state.doc.toString()).toBe('输入更新');
    fixture.destroy();
  });

  it('存在真实 FormControl 时，后到的 value 输入不能覆盖表单文档', async () => {
    await TestBed.configureTestingModule({ imports: [ReviewFormHost] }).compileComponents();
    const fixture = TestBed.createComponent(ReviewFormHost);
    fixture.detectChanges();
    const host = fixture.componentInstance;
    expect(host.editor().view?.state.doc.toString()).toBe('表单初值');
    host.control.setValue('表单更新');
    fixture.detectChanges();
    expect(host.editor().view?.state.doc.toString()).toBe('表单更新');
    host.external.set('后到的输入');
    fixture.detectChanges();
    expect(host.control.value).toBe('表单更新');
    expect(host.editor().view?.state.doc.toString()).toBe('表单更新');
    fixture.destroy();
  });
});
