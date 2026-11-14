import { Component, inject, signal, type OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BOM_WORKSPACE_CONFIG, type DomainImportEnvelope } from './config';
import { BomDemoService } from './app/bom-demo.service';

@Component({
  selector: 'bom-transfer-page', imports: [RouterLink],
  template: `
    <section class="panel" aria-labelledby="transfer-title">
      <h1 id="transfer-title">工作区备份与迁移</h1>
      <p>备份包含领域数据库的草稿、修订、ECN、映射、实例与历史。模型文件和结构工作台的独立快照另行保存。</p>
      <p>当前数据库：<code data-testid="domain-database">{{ service.databaseName() }}</code></p>
      <div class="toolbar">
        <button class="btn btn-primary" [disabled]="busy() || !service.connected()" (click)="backup()">下载完整领域备份</button>
        <button class="btn" [disabled]="busy() || !service.previousDatabase()" (click)="rollback()">回退到保留的原库</button>
      </div>
      @if (pending(); as draft) {
        <section class="panel-inset" data-testid="domain-import-preview">
          <h2>从结构工作台接收草稿</h2>
          <p>{{ draft.name }} · {{ draft.rootItemNo }} · 修订 {{ draft.revisionNo }} · {{ draft.orgId }}</p>
          <p>{{ draft.records.length }} 条领域记录；{{ draft.identities.length }} 个来源位置对应关系。校验成功后整批写入领域草稿，发布另行操作。</p>
          <button class="btn btn-primary" [disabled]="busy() || !service.connected()" (click)="importDraft()">校验并写入领域草稿</button>
        </section>
      }
      @if (imported(); as draft) {
        <a class="btn" routerLink="/explosion" [queryParams]="{ root: draft.rootItemNo, qty: '1', config: '{}', unit: 'none' }">核对导入装配并发布</a>
      }
      <a class="btn" routerLink="/explosion">进入领域展开、导入校验与发布</a>
      <h2>从旧版迁入</h2>
      <ol><li>在旧版的“备份与迁移”下载完整领域备份，保留原文件。</li><li>在这里选择归档；校验并恢复到一个新库后切换。当前库保留，可随时回退。</li></ol>
      <label>选择领域备份文件 <input type="file" accept=".rxdb-backup,application/octet-stream" [disabled]="busy()" (change)="file($event)" /></label>
      @if (incoming(); as file) {
        <p>{{ file.name }} · {{ file.size }} 字节</p>
        <button class="btn btn-primary" [disabled]="busy()" (click)="restore()">校验并迁入新库</button>
      }
      @if (busy()) { <p role="status">正在处理，请保留此页面…</p> }
      @if (message()) { <p class="success-box" role="status">{{ message() }}</p> }
      @if (error()) { <p class="error-box" role="alert">{{ error() }}</p> }
      <p class="hint">导入会核对归档校验和、实体结构和引擎兼容性。失败不切换当前库，也不覆盖原库。</p>
    </section>
  `
})
export class TransferPage implements OnInit {
  private readonly config = inject(BOM_WORKSPACE_CONFIG);
  readonly pending = signal<DomainImportEnvelope | undefined>(undefined);
  readonly imported = signal<DomainImportEnvelope | undefined>(undefined);
  readonly service = inject(BomDemoService);
  readonly incoming = signal<File | null>(null);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly error = signal('');

  async ngOnInit(): Promise<void> {
    try { this.pending.set(await this.config.readPending?.()); }
    catch (error) { this.error.set(transferError(error)); }
  }
  async importDraft(): Promise<void> {
    const envelope = this.pending(); if (!envelope) return;
    await this.run(async () => {
      const result = await this.service.importBom(envelope.records);
      if (!result.committed) throw new Error(result.diagnostics.map(issue => issue.message).join('；'));
      this.message.set(`已写入领域草稿：${envelope.rootItemNo}。可进入展开页核对并发布。`);
      this.imported.set(envelope); this.pending.set(undefined);
      await this.config.completePending?.(envelope);
    });
  }

  file(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0]; input.value = '';
    this.error.set(''); this.message.set(''); this.incoming.set(null);
    if (!file) return;
    if (file.size > 500 * 1024 * 1024) { this.error.set('归档超过 500 MiB，请使用流式迁移工具'); return; }
    this.incoming.set(file);
  }
  async backup(): Promise<void> {
    await this.run(async () => {
      const result = await this.service.backup();
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a'); link.href = url; link.download = `${this.service.databaseName()}.rxdb-backup`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.message.set(`备份已生成，SHA-256：${result.sha256}；数据库字节数：${result.bytes}`);
    });
  }
  async restore(): Promise<void> {
    const file = this.incoming(); if (!file) return;
    await this.run(async () => {
      const name = await this.service.restoreBackup(file);
      this.incoming.set(null); this.message.set(`迁入完成，已切换到 ${name}。原库保留。`);
    });
  }
  async rollback(): Promise<void> {
    await this.run(async () => { await this.service.rollbackDatabase(); this.message.set('已回退到保留的原库。'); });
  }
  private async run(work: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    try { await work(); } catch (error) { this.error.set(transferError(error)); }
    finally { this.busy.set(false); }
  }
}

const transferError = (error: unknown): string => {
  const messages: string[] = []; let cause = error;
  while (cause instanceof Error && messages.length < 8) { messages.push(cause.message); cause = cause.cause; }
  return messages.length ? messages.join('：') : String(error);
};
