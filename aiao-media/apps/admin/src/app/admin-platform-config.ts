import { Component, effect, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProductRequestError, type ProductClient } from './product-client';

interface PlatformConfigurationResponse {
  revision: number;
  models: Record<string, unknown>[];
  capabilities: Record<string, unknown>[];
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function response(value: unknown): PlatformConfigurationResponse {
  const row = record(value);
  if (!row || !Number.isSafeInteger(row['revision']) || !Array.isArray(row['models']) || !Array.isArray(row['capabilities']))
    throw new Error('平台配置回执无效。');
  const models = row['models'].map(record);
  const capabilities = row['capabilities'].map(record);
  if (models.some(value => value === null) || capabilities.some(value => value === null))
    throw new Error('平台配置目录无效。');
  return {
    revision: row['revision'] as number,
    models: models as Record<string, unknown>[],
    capabilities: capabilities as Record<string, unknown>[]
  };
}

const modelExample = JSON.stringify(
  [
    {
      id: 'image-default',
      name: '平台图片',
      credits: 1,
      protocol: 'openai',
      baseUrl: 'https://api.example.com/v1',
      model: 'replace-image-model',
      apiKey: 'replace-with-provider-key',
      sizes: ['1024x1024'],
      aspectRatios: ['1:1'],
      qualities: ['low', 'high'],
      counts: [1],
      supportsImageEditing: false
    }
  ],
  null,
  2
);
const capabilityExample = JSON.stringify(
  [
    {
      providerInstanceId: '10000000-0000-4000-8000-000000000001',
      providerRevision: 1,
      kind: 'audio',
      operation: 'text-to-speech',
      label: '平台 TTS',
      modelId: 'tts-default',
      credits: 1,
      protocol: 'openai',
      baseUrl: 'https://api.example.com/v1',
      model: 'replace-tts-model',
      apiKey: 'replace-with-provider-key',
      input: { textMaxLength: 4000 },
      parameters: { languages: ['zh-CN'], voices: [{ id: 'alloy', label: 'Alloy' }], speeds: [1] },
      output: { mediaTypes: ['audio/wav'], maxBytes: 8388608, maxDurationMs: 120000 }
    }
  ],
  null,
  2
);

@Component({
  selector: 'app-admin-platform-config',
  imports: [FormsModule],
  template: `
    <section class="platform-config" aria-labelledby="platform-config-title">
      <header class="page-header">
        <p class="section-kicker">平台能力</p>
        <h2 id="platform-config-title">媒体平台配置</h2>
        <p>图片模型、ASR、TTS、音乐和视频能力统一在这里发布。供应商地址、上游模型和 API Key 只保存在服务端。</p>
      </header>

      @if (message()) {
        <p class="message" role="status">{{ message() }}</p>
      }
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      @if (loading()) {
        <p class="loading" role="status">正在读取平台配置…</p>
      }

      @if (!loading()) {
        <section class="summary" aria-label="当前配置摘要">
          <div><strong>{{ models().length }}</strong><span>个图片模型</span></div>
          <div><strong>{{ capabilities().length }}</strong><span>项媒体能力</span></div>
          <div><strong>r{{ revision() }}</strong><span>当前修订</span></div>
        </section>

        <section class="catalog" aria-labelledby="catalog-title">
          <div class="section-heading">
            <div>
              <p class="section-kicker">公开目录</p>
              <h3 id="catalog-title">已发布能力</h3>
            </div>
            <button class="btn btn-ghost btn-sm" [disabled]="loading()" (click)="load()" type="button">重新读取</button>
          </div>
          @if (models().length || capabilities().length) {
            <div class="table-scroll">
              <table class="table-zebra table">
                <thead><tr><th>类型</th><th>标识</th><th>能力</th><th>凭据</th></tr></thead>
                <tbody>
                  @for (model of models(); track model['id']) {
                    <tr>
                      <td>图片模型</td>
                      <td>{{ model['id'] }}<small>{{ model['name'] }}</small></td>
                      <td>{{ model['protocol'] }} · {{ model['credits'] }} 积分</td>
                      <td>{{ model['credentialsConfigured'] ? '已配置' : '未配置' }}</td>
                    </tr>
                  }
                  @for (capability of capabilities(); track capability['providerInstanceId'] + ':' + capability['operation']) {
                    <tr>
                      <td>{{ capability['operation'] }}</td>
                      <td>{{ capability['modelId'] }}<small>{{ capability['label'] }}</small></td>
                      <td>{{ capability['kind'] }} · {{ capability['credits'] }} 积分</td>
                      <td>{{ capability['credentialsConfigured'] ? '已配置' : '未配置' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <p class="empty">还没有发布平台能力。</p>
          }
        </section>

        <form class="editor" (ngSubmit)="save()">
          <div class="section-heading">
            <div>
              <p class="section-kicker">服务端配置</p>
              <h3>替换完整目录</h3>
            </div>
            <span class="revision">保存基于 r{{ revision() }}</span>
          </div>
          <p class="hint">保存时会整体替换两份目录。读取接口不会回显私密字段，更新已有供应商时请再次填写完整 JSON 和 API Key。</p>
          <label>
            图片模型 JSON
            <textarea
              [(ngModel)]="modelsJson"
              name="modelsJson"
              rows="14"
              spellcheck="false"
              [placeholder]="modelExample"
            ></textarea>
          </label>
          <label>
            ASR / TTS / 音乐 / 视频 JSON
            <textarea
              [(ngModel)]="capabilitiesJson"
              name="capabilitiesJson"
              rows="18"
              spellcheck="false"
              [placeholder]="capabilityExample"
            ></textarea>
          </label>
          <div class="actions">
            <button class="btn btn-primary" [disabled]="loading()" type="submit">保存并启用</button>
            <button class="btn btn-ghost" [disabled]="loading()" (click)="clearEditor()" type="button">清空输入</button>
          </div>
        </form>
      }
    </section>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .platform-config { width: min(1440px, 100%); margin: 0 auto; padding: clamp(1.25rem, 3vw, 2.75rem); }
    .page-header { margin-bottom: 1.25rem; }
    h2, h3 { margin: 0; }
    h2 { font-size: 1.35rem; }
    h3 { font-size: 1rem; }
    p { margin: 0.4rem 0 0; }
    .section-kicker { margin: 0 0 0.45rem; color: var(--color-primary); font-size: 0.7rem; font-weight: 750; }
    .message, .error, .loading { margin: 0.75rem 0; }
    .message { color: var(--color-success); }
    .error { color: var(--color-error); }
    .summary { display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 1rem 0; }
    .summary div { display: grid; gap: 0.1rem; min-width: 9rem; border: 1px solid var(--color-base-300); border-radius: 0.75rem; padding: 0.85rem 1rem; background: var(--color-base-100); }
    .summary strong { font-size: 1.3rem; }
    .summary span, small, .hint, .revision, .empty { opacity: 0.75; }
    .catalog, .editor { margin-top: 1rem; border: 1px solid var(--color-base-300); border-radius: 0.85rem; padding: 1rem; background: var(--color-base-100); }
    .section-heading, .actions { display: flex; flex-wrap: wrap; gap: 0.65rem; align-items: center; justify-content: space-between; }
    .table-scroll { overflow-x: auto; margin-top: 0.75rem; }
    table { width: 100%; }
    td small { display: block; margin-top: 0.2rem; }
    .editor { display: grid; gap: 0.9rem; }
    .editor label { display: grid; gap: 0.4rem; font-weight: 650; }
    textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--color-base-300); border-radius: 0.55rem; padding: 0.75rem; background: var(--color-base-100); color: inherit; font: 0.78rem/1.45 var(--font-mono, ui-monospace); resize: vertical; }
    .actions { justify-content: flex-start; }
  `
})
export class AdminPlatformConfigComponent {
  readonly client = input.required<ProductClient>();
  readonly loading = signal(false);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly revision = signal(0);
  readonly models = signal<readonly Record<string, unknown>[]>([]);
  readonly capabilities = signal<readonly Record<string, unknown>[]>([]);
  readonly modelExample = modelExample;
  readonly capabilityExample = capabilityExample;
  modelsJson = '';
  capabilitiesJson = '';

  constructor() {
    effect(() => {
      const client = this.client();
      untracked(() => void this.load(client));
    });
  }

  async load(client = this.client()): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      this.apply(await this.read(client));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : '平台配置读取失败。');
    } finally {
      this.loading.set(false);
    }
  }

  clearEditor(): void {
    this.modelsJson = '';
    this.capabilitiesJson = '';
  }

  async save(): Promise<void> {
    if (this.loading()) return;
    let models: unknown;
    let capabilities: unknown;
    try {
      models = JSON.parse(this.modelsJson);
      capabilities = JSON.parse(this.capabilitiesJson);
    } catch {
      this.error.set('请输入合法的 JSON 数组。');
      return;
    }
    if (!Array.isArray(models) || !Array.isArray(capabilities)) {
      this.error.set('两份配置都必须是 JSON 数组。');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.message.set(null);
    try {
      const result = record(
        await this.client().admin('platform-config', 'PUT', {
          revision: this.revision(),
          requestId: crypto.randomUUID(),
          models,
          capabilities
        })
      );
      if (!result || !Number.isSafeInteger(result['revision'])) throw new Error('平台配置保存回执无效。');
      const savedRevision = result['revision'] as number;
      this.revision.set(savedRevision);
      this.clearEditor();
      try {
        this.apply(await this.read(this.client()));
        this.message.set('平台配置已保存，新的目录已生效。');
      } catch (error) {
        this.message.set('平台配置已保存，但目录刷新失败，请点击“重新读取”。');
        this.error.set(error instanceof Error ? error.message : '平台配置目录刷新失败。');
      }
    } catch (error) {
      this.error.set(
        error instanceof ProductRequestError && error.status === 409 ?
          '配置版本已变化，请重新读取后再保存。'
        : error instanceof Error ? error.message
        : '平台配置保存失败。'
      );
    } finally {
      this.loading.set(false);
    }
  }

  private apply(value: PlatformConfigurationResponse): void {
    this.revision.set(value.revision);
    this.models.set(value.models);
    this.capabilities.set(value.capabilities);
  }

  private async read(client: ProductClient): Promise<PlatformConfigurationResponse> {
    return response(await client.admin('platform-config'));
  }

}
