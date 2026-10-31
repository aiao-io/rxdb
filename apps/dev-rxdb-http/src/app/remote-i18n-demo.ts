import { RxDB } from '@aiao/rxdb';
import { MessageEntry, messageId, RemoteMessageEntry } from '@aiao/rxdb-i18n';
import { I18N, useI18n } from '@aiao/rxdb-i18n-angular';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { resolveApiBaseUrl } from './demo-config';
import { REMOTE_I18N_KEYS, REMOTE_I18N_NAMESPACE } from './remote-i18n';

@Component({
  selector: 'app-i18n-demo',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="catalog" aria-labelledby="catalog-title">
      <h2 id="catalog-title">远端目录分发</h2>
      <span
        >当前语言：<output data-testid="i18n-locale">{{ i18n.locale() }}</output></span
      >
      <p>本地覆盖优先，其次远端目录，最后随包默认文案。后端修改通过变更通知更新，离线继续读取缓存。</p>
      @for (key of keys; track key) {
        <div class="message">
          <strong>{{ key }}</strong>
          <output [attr.data-testid]="'i18n-message-' + key">{{ i18n.t(key) }}</output>
          <span [attr.data-testid]="'i18n-source-' + key">{{ source(key) }}</span>
        </div>
      }
      <label
        >远端 greeting
        <input [ngModel]="remoteValue()" (ngModelChange)="remoteValue.set($event)" data-testid="i18n-remote-value" />
      </label>
      <button (click)="updateRemote()" data-testid="i18n-update-remote" type="button">更新远端文案</button>
      <button (click)="deleteRemote()" data-testid="i18n-delete-remote" type="button">删除远端目录</button>
      <button (click)="setLocalOverride()" data-testid="i18n-local-override" type="button">
        设置本地 greeting 覆盖
      </button>
      <button (click)="removeLocalOverride()" data-testid="i18n-remove-override" type="button">清除本地覆盖</button>
      <button (click)="readLocalOverrides()" data-testid="i18n-read-local" type="button">读取本地目录行数</button>
      <span
        >本地覆盖：<output data-testid="i18n-local-count">{{ localCount() }}</output></span
      >
      <span
        >远端缓存：<output data-testid="i18n-remote-count">{{ remoteCount() }}</output></span
      >
      @if (error()) {
        <p data-testid="i18n-catalog-error" role="alert">{{ error() }}</p>
      }
    </section>
  `,
  styles: [
    `
      .catalog {
        border: 1px solid #94a3b8;
        border-radius: 0.5rem;
        margin: 1rem;
        padding: 1rem;
      }
      .message {
        display: flex;
        gap: 1rem;
        margin: 0.75rem 0;
      }
      button,
      input {
        margin: 0.25rem;
        padding: 0.35rem 0.6rem;
        border: 1px solid #94a3b8;
        border-radius: 0.25rem;
      }
      button {
        cursor: pointer;
      }
    `
  ]
})
export class RemoteI18nDemo {
  readonly #runtime = inject(I18N);
  readonly #rxdb = inject(RxDB);
  readonly #baseUrl = resolveApiBaseUrl(location.search);
  readonly i18n = useI18n();
  readonly keys = REMOTE_I18N_KEYS;
  readonly remoteValue = signal('Remote greeting v2');
  readonly error = signal<string | null>(null);
  readonly localCount = signal<number | null>(null);
  readonly remoteCount = signal<number | null>(null);

  source(key: string): string {
    this.i18n.t(key);
    const source = this.#runtime.resolve(key).source;
    return (
      source === 'db' ? '本地覆盖'
      : source === 'remote' ? '远端目录'
      : '随包默认'
    );
  }

  async updateRemote(): Promise<void> {
    await this.#run(async () => {
      const id = messageId('en', REMOTE_I18N_NAMESPACE, 'greeting');
      const response = await fetch(`${this.#baseUrl}/messages/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: this.remoteValue() })
      });
      if (!response.ok) throw new Error(`更新目录失败：${response.status}`);
    });
  }

  async deleteRemote(): Promise<void> {
    await this.#run(async () => {
      const ids = REMOTE_I18N_KEYS.map(key => messageId('en', REMOTE_I18N_NAMESPACE, key));
      const response = await fetch(`${this.#baseUrl}/messages/delete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      if (!response.ok) throw new Error(`删除目录失败：${response.status}`);
    });
  }

  async setLocalOverride(): Promise<void> {
    await this.#run(() =>
      this.#runtime.setMessages({
        locale: 'en',
        namespace: REMOTE_I18N_NAMESPACE,
        messages: { greeting: 'Local greeting' }
      })
    );
    await this.readLocalOverrides();
  }

  async removeLocalOverride(): Promise<void> {
    await this.#run(() => this.#runtime.removeMessages('en', REMOTE_I18N_NAMESPACE, ['greeting']));
    await this.readLocalOverrides();
  }

  async readLocalOverrides(): Promise<void> {
    await this.#run(async () => {
      const rows = await this.#rxdb.localAdapterSync
        .getRepository(MessageEntry)
        .find({ where: { combinator: 'and', rules: [] } });
      this.localCount.set(rows.length);
      const remote = await this.#rxdb.localAdapterSync
        .getRepository(RemoteMessageEntry)
        .find({ where: { combinator: 'and', rules: [] } });
      this.remoteCount.set(remote.length);
    });
  }

  async #run(action: () => Promise<void>): Promise<void> {
    this.error.set(null);
    try {
      await action();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    }
  }
}
