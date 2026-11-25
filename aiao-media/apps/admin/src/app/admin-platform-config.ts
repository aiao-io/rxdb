import { AUDIO_TEXT_MAX_LENGTH } from '@aiao-media/api-contracts';
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
  if (
    !row ||
    !Number.isSafeInteger(row['revision']) ||
    !Array.isArray(row['models']) ||
    !Array.isArray(row['capabilities'])
  )
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

interface CatalogPreview extends PlatformConfigurationResponse {
  groups: { label: string; entries: string[] }[];
}

function catalogEntries(models: readonly unknown[], capabilities: readonly unknown[]): Map<string, string> {
  const entries = new Map<string, string>();
  const add = (key: string, label: string) => {
    if (entries.has(key)) throw new Error('目录中存在重复的模型或媒体能力标识。');
    entries.set(key, label);
  };
  for (const model of models) {
    const id = record(model)?.['id'];
    if (typeof id !== 'string' || !id.trim()) throw new Error('每个图片模型都需要填写 id。');
    add('image/' + id, '图片模型 · ' + id);
  }
  for (const capability of capabilities) {
    const row = record(capability);
    const identity = [row?.['providerInstanceId'], row?.['providerRevision'], row?.['modelId'], row?.['operation']];
    if (
      !identity.every((part, index) =>
        index === 1 ? Number.isSafeInteger(part) : typeof part === 'string' && part.trim()
      )
    )
      throw new Error('每项媒体能力都需要填写供应商实例、修订号、模型和操作。');
    add(JSON.stringify(identity), `${identity[3]} · ${identity[2]}（${identity[0]}，r${identity[1]}）`);
  }
  return entries;
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
      input: { textMaxLength: AUDIO_TEXT_MAX_LENGTH },
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
          <div>
            <strong>{{ models().length }}</strong><span>个图片模型</span>
          </div>
          <div>
            <strong>{{ capabilities().length }}</strong><span>项媒体能力</span>
          </div>
          <div>
            <strong>r{{ revision() }}</strong
            ><span>当前修订</span>
          </div>
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
                <thead>
                  <tr>
                    <th>类型</th>
                    <th>标识</th>
                    <th>能力</th>
                    <th>凭据</th>
                  </tr>
                </thead>
                <tbody>
                  @for (model of models(); track model['id']) {
                    <tr>
                      <td>图片模型</td>
                      <td>
                        {{ model['id'] }}<small>{{ model['name'] }}</small>
                      </td>
                      <td>{{ model['protocol'] }} · {{ model['credits'] }} 积分</td>
                      <td>{{ model['credentialsConfigured'] ? '已配置' : '未配置' }}</td>
                    </tr>
                  }
                  @for (
                    capability of capabilities();
                    track capability['providerInstanceId'] +
                      '/' +
                      capability['providerRevision'] +
                      '/' +
                      capability['modelId'] +
                      '/' +
                      capability['operation']
                  ) {
                    <tr>
                      <td>{{ capability['operation'] }}</td>
                      <td>
                        {{ capability['modelId'] }}<small>{{ capability['label'] }}</small>
                      </td>
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

        <form class="editor" (ngSubmit)="previewChanges()">
          <div class="section-heading">
            <div>
              <p class="section-kicker">服务端配置</p>
              <h3>替换完整目录</h3>
            </div>
            <span class="revision">保存基于 r{{ revision() }}</span>
          </div>
          @if (preview(); as review) {
            <section class="editor" aria-label="目录变更预览">
              <h3>目录变更预览 · r{{ review.revision }}</h3>
              <p>保留的标识仍可使用，参数和凭据将按本次输入更新。</p>
              @for (group of review.groups; track group.label) {
                <div>
                  <strong>{{ group.label }}（{{ group.entries.length }}）</strong>
                  <ul>
                    @for (entry of group.entries; track entry) {
                      <li>{{ entry }}</li>
                    }
                  </ul>
                </div>
              }
              <div class="actions">
                <button class="btn btn-primary" (click)="save()" type="button">确认保存并启用</button>
                <button class="btn btn-ghost" (click)="preview.set(null)" type="button">返回编辑</button>
              </div>
            </section>
          } @else {
            <p class="hint">
              保存时会整体替换两份目录。读取接口不会回显私密字段，更新已有供应商时请再次填写完整 JSON 和 API Key。
            </p>
            <label>
              图片模型 JSON
              <textarea
                [(ngModel)]="modelsJson"
                [placeholder]="modelExample"
                name="modelsJson"
                rows="14"
                spellcheck="false"
              ></textarea>
            </label>
            <label>
              ASR / TTS / 音乐 / 视频 JSON
              <textarea
                [(ngModel)]="capabilitiesJson"
                [placeholder]="capabilityExample"
                name="capabilitiesJson"
                rows="18"
                spellcheck="false"
              ></textarea>
            </label>
            <div class="actions">
              <button class="btn btn-primary" [disabled]="!catalogLoaded()" type="submit">预览变更</button>
              <button class="btn btn-ghost" [disabled]="loading()" (click)="clearEditor()" type="button">
                清空输入
              </button>
            </div>
          }
        </form>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .platform-config {
      width: min(1440px, 100%);
      margin: 0 auto;
      padding: clamp(1.25rem, 3vw, 2.75rem);
    }
    .page-header {
      margin-bottom: 1.25rem;
    }
    h2,
    h3 {
      margin: 0;
    }
    h2 {
      font-size: 1.35rem;
    }
    h3 {
      font-size: 1rem;
    }
    p {
      margin: 0.4rem 0 0;
    }
    .section-kicker {
      margin: 0 0 0.45rem;
      color: var(--color-primary);
      font-size: 0.7rem;
      font-weight: 750;
    }
    .message,
    .error,
    .loading {
      margin: 0.75rem 0;
    }
    .message {
      color: var(--color-success);
    }
    .error {
      color: var(--color-error);
    }
    .summary {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin: 1rem 0;
    }
    .summary div {
      display: grid;
      gap: 0.1rem;
      min-width: 9rem;
      border: 1px solid var(--color-base-300);
      border-radius: 0.75rem;
      padding: 0.85rem 1rem;
      background: var(--color-base-100);
    }
    .summary strong {
      font-size: 1.3rem;
    }
    .summary span,
    small,
    .hint,
    .revision,
    .empty {
      opacity: 0.75;
    }
    .catalog,
    .editor {
      margin-top: 1rem;
      border: 1px solid var(--color-base-300);
      border-radius: 0.85rem;
      padding: 1rem;
      background: var(--color-base-100);
    }
    .section-heading,
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.65rem;
      align-items: center;
      justify-content: space-between;
    }
    .table-scroll {
      overflow-x: auto;
      margin-top: 0.75rem;
    }
    table {
      width: 100%;
    }
    td small {
      display: block;
      margin-top: 0.2rem;
    }
    .editor {
      display: grid;
      gap: 0.9rem;
    }
    .editor label {
      display: grid;
      gap: 0.4rem;
      font-weight: 650;
    }
    textarea {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--color-base-300);
      border-radius: 0.55rem;
      padding: 0.75rem;
      background: var(--color-base-100);
      color: inherit;
      font: 0.78rem/1.45 var(--font-mono, ui-monospace);
      resize: vertical;
    }
    .actions {
      justify-content: flex-start;
    }
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
  readonly preview = signal<CatalogPreview | null>(null);
  readonly catalogLoaded = signal(false);
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
    this.catalogLoaded.set(false);
    this.preview.set(null);
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

  previewChanges(): void {
    if (this.loading() || !this.catalogLoaded() || this.preview()) return;
    this.message.set(null);
    this.error.set(null);
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
    try {
      const next = response({ revision: this.revision(), models, capabilities });
      const before = catalogEntries(this.models(), this.capabilities());
      const after = catalogEntries(next.models, next.capabilities);
      this.preview.set({
        ...next,
        groups: [
          { label: '新增', entries: [...after].filter(([key]) => !before.has(key)).map(([, label]) => label) },
          { label: '保留', entries: [...after].filter(([key]) => before.has(key)).map(([, label]) => label) },
          { label: '移除', entries: [...before].filter(([key]) => !after.has(key)).map(([, label]) => label) }
        ]
      });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : '目录格式无效。');
    }
  }

  async save(): Promise<void> {
    const review = this.preview();
    if (this.loading() || !review) return;
    this.loading.set(true);
    this.error.set(null);
    this.message.set(null);
    try {
      const result = record(
        await this.client().admin('platform-config', 'PUT', {
          revision: review.revision,
          requestId: crypto.randomUUID(),
          models: review.models,
          capabilities: review.capabilities
        })
      );
      if (!result || !Number.isSafeInteger(result['revision'])) throw new Error('平台配置保存回执无效。');
      const savedRevision = result['revision'] as number;
      this.revision.set(savedRevision);
      this.clearEditor();
      this.preview.set(null);
      this.catalogLoaded.set(false);
      try {
        this.apply(await this.read(this.client()));
        this.message.set('平台配置已保存，新的目录已生效。');
      } catch (error) {
        this.message.set('平台配置已保存，但目录刷新失败，请点击“重新读取”。');
        this.error.set(error instanceof Error ? error.message : '平台配置目录刷新失败。');
      }
    } catch (error) {
      this.preview.set(null);
      if (error instanceof ProductRequestError && error.status === 409) this.catalogLoaded.set(false);
      this.error.set(
        error instanceof ProductRequestError && error.status === 409 ? '配置版本已变化，请重新读取后再保存。'
        : error instanceof Error ? error.message
        : '平台配置保存失败。'
      );
    } finally {
      this.loading.set(false);
    }
  }

  private apply(value: PlatformConfigurationResponse): void {
    this.revision.set(value.revision);
    this.catalogLoaded.set(true);
    this.models.set(value.models);
    this.capabilities.set(value.capabilities);
  }

  private async read(client: ProductClient): Promise<PlatformConfigurationResponse> {
    return response(await client.admin('platform-config'));
  }
}
