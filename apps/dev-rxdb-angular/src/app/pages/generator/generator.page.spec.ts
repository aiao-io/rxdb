import { CodeEditor } from '@aiao/code-editor-angular';
import { Component, forwardRef, input, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { ThemeService } from '@modules/angular';
import { AngularSplitModule } from 'angular-split';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GENERATOR_DEMOS } from './generator-state';
import GeneratorPage from './generator.page';

/**
 * @fileoverview 生成器页的产物与下载闸门（与 React / Vue 同口径）：内置的两个示例都要能生成，
 * 输入无效或清空时显示错误 / 不留旧产物，不能下载与当前输入不对应的代码。
 */

/** CodeMirror 在 happy-dom 里只渲染可视区的行：换成直接显示文本、可模拟输入的桩。 */
@Component({
  selector: 'ao-code-editor',
  template: '<pre data-testid="code-editor-stub">{{ value() ?? text() }}</pre>',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CodeEditorStub), multi: true }]
})
class CodeEditorStub implements ControlValueAccessor {
  readonly value = input<string>();
  readonly language = input<string>();
  readonly theme = input<string>();
  readonly text = signal('');
  #onChange: (value: string) => void = () => undefined;

  writeValue(value: string | null): void {
    this.text.set(value ?? '');
  }
  registerOnChange(fn: (value: string) => void): void {
    this.#onChange = fn;
  }
  registerOnTouched(): void {
    // 桩不跟踪 touched
  }
  type(value: string): void {
    this.text.set(value);
    this.#onChange(value);
  }
}

@Component({ selector: 'as-split', template: '<ng-content />' })
class SplitStub {
  readonly direction = input<string>();
}

@Component({ selector: 'as-split-area', template: '<ng-content />' })
class SplitAreaStub {
  readonly size = input<number>();
}

let fixture: ComponentFixture<GeneratorPage>;

const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
const downloadButton = (): HTMLButtonElement => {
  const button = host().querySelector<HTMLButtonElement>('[data-testid="generator-download"]');
  if (button === null) throw new Error('找不到下载按钮');
  return button;
};
const outputText = (): string =>
  host().querySelector('[data-testid="generator-output-editor"]')?.textContent?.trim() ?? '';
const alertText = (): string | null => host().querySelector('[role="alert"]')?.textContent?.trim() ?? null;
const inputEditor = (): CodeEditorStub =>
  fixture.debugElement.query(By.css('[data-testid="generator-input-editor"] ao-code-editor')).componentInstance;

async function settle(): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

async function selectDemo(name: string): Promise<void> {
  const tab = [...host().querySelectorAll<HTMLElement>('[role="tab"]')].find(el => el.textContent?.trim() === name);
  if (tab === undefined) throw new Error(`找不到示例 ${name}`);
  tab.click();
  await settle();
}

beforeEach(async () => {
  TestBed.overrideComponent(GeneratorPage, {
    remove: { imports: [CodeEditor, AngularSplitModule] },
    add: { imports: [CodeEditorStub, SplitStub, SplitAreaStub, ReactiveFormsModule, FormsModule] }
  });
  await TestBed.configureTestingModule({
    imports: [GeneratorPage],
    providers: [{ provide: ThemeService, useValue: { $currentThemeLightDark: signal<'light' | 'dark'>('light') } }]
  }).compileComponents();
  fixture = TestBed.createComponent(GeneratorPage);
  await settle();
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('GeneratorPage：产物与下载', () => {
  it('Menu 示例经树生成器产出树查询方法，可以下载', async () => {
    await selectDemo('Menu');

    expect(outputText()).toContain('findDescendants');
    expect(alertText()).toBeNull();
    expect(downloadButton().disabled).toBe(false);
  });

  it('输入无效时显示错误、清掉旧产物且不能下载；改回有效输入后恢复', async () => {
    expect(outputText()).toContain('class Todo');

    inputEditor().type('{ invalid json');
    await settle();

    expect(alertText()).not.toBe('');
    expect(alertText()).not.toBeNull();
    expect(outputText()).not.toContain('class Todo');
    expect(downloadButton().disabled).toBe(true);

    inputEditor().type(JSON.stringify(GENERATOR_DEMOS[0], null, 2));
    await settle();

    expect(alertText()).toBeNull();
    expect(outputText()).toContain('class Todo');
    expect(downloadButton().disabled).toBe(false);
  });

  it('清空输入时没有产物，也不能下载', async () => {
    inputEditor().type('');
    await settle();

    expect(alertText()).toBeNull();
    expect(outputText()).toBe('');
    expect(downloadButton().disabled).toBe(true);
  });
});
