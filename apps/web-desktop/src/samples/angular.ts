import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import type { FrameworkDocument } from './document.js';

export async function render(root: HTMLElement, model: FrameworkDocument): Promise<() => void> {
  class Sample {
    readonly model = model;
    readonly view = signal(model.snapshot);
    rename(event: Event) { model.rename((event.target as HTMLInputElement).value); }
    edit(event: Event) { model.edit((event.target as HTMLTextAreaElement).value); }
    locate(event: Event) { model.setLocation((event.target as HTMLInputElement).value); }
    navigate(event: Event) { event.preventDefault(); void model.navigate(); }
  }
  Component({
    selector: 'desktop-sample', standalone: true,
    template: `
      <main class="framework-sample" [attr.data-route]="view().route" [attr.data-theme]="view().theme"
        [attr.data-accent]="view().accent" [style.--desktop-scale]="view().scale / 100">
        <h1>{{ model.label }}</h1>
        @if (!view().desktop) { <p class="sample-boundary">独立运行：可以编辑和下载文本。桌面托管文件、剪贴板和窗口能力不可用。</p> }
        @if (view().error) { <p role="alert">{{ view().error }}</p> }
        @if (!view().loaded && view().error) { <button (click)="model.start()">重试读取</button> }
        <label>文件名<input [value]="view().name" [disabled]="view().busy || !view().loaded" (input)="rename($event)" /></label>
        <label for="document-text">文档内容</label>
        <textarea id="document-text" [value]="view().text" [disabled]="view().busy || !view().loaded" (input)="edit($event)"></textarea>
        <div class="sample-actions">
          <button [disabled]="!view().desktop || view().busy || !view().loaded" (click)="model.save()">保存到我的文件</button>
          <button [disabled]="view().busy || !view().loaded" (click)="model.exportText()">下载文本</button>
          <button [disabled]="!view().canUndo || view().busy" (click)="model.undo()">撤销</button>
          <button [disabled]="!view().canRedo || view().busy" (click)="model.redo()">重做</button>
          <button [disabled]="!view().desktop || view().busy" (click)="model.copy()">复制全文</button>
          <button [disabled]="!view().desktop || view().busy" (click)="model.check()">检查当前内容</button>
          <button (click)="model.toggleAccent()">切换强调色</button>
        </div>
        <form class="sample-route" (submit)="navigate($event)">
          <label>逻辑位置<input [value]="view().location" (input)="locate($event)" /></label>
          <button [disabled]="view().busy">前往位置</button>
        </form>
        <p role="status">{{ view().busy ? '正在处理…' : view().message }}</p>
      </main>
    `
  })(Sample);
  root.replaceChildren(document.createElement('desktop-sample'));
  const app = await bootstrapApplication(Sample);
  const component = app.components[0].instance as Sample;
  const unsubscribe = model.subscribe(() => component.view.set(model.snapshot));
  component.view.set(model.snapshot);
  await app.whenStable();
  return () => { unsubscribe(); app.destroy(); };
}
