import { ChangeDetectionStrategy, Component, effect, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  validatePublishedTemplate,
  type ProviderPolicy,
  type ProviderPolicyEntry,
  type TaskReport
} from '../contracts/product-data.mjs';
import { imageMvpCatalog } from './image-mvp-catalog';
import type { ProductClient } from './product-client';
import type { PromptTemplate } from './prompts/prompt-catalog';

interface AdminUser {
  id: string;
  email: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  disabled: boolean;
  revision: number;
  authState: string;
}
interface ContentRow {
  kind: 'template' | 'provider-policy';
  key: string;
  revision: number;
  payload: unknown;
}
interface ContentPage {
  drafts: ContentRow[];
  published: Pick<ContentRow, 'kind' | 'key' | 'revision'>[];
}
interface ReportRow {
  id: string;
  owner_id: string;
  model: string;
  channel: string;
  status: string;
  started_at: string;
  payload: TaskReport;
}
interface UsageBucket {
  records: number;
  requestCount: number | null;
  providerUnits: number | null;
  verifiedCost: number | null;
  currencies: Record<string, number>;
  unknown?: { requestCount: number; providerUnits: number; verifiedCost: number };
}
interface AdminUsage {
  sources: Record<string, UsageBucket>;
  partial: boolean;
}
interface AuditEntry {
  id: number;
  actor_id: string;
  action: string;
  target_id: string;
  created_at: string;
}
type AdminTab = 'users' | 'templates' | 'policies' | 'tasks' | 'audit';

@Component({
  selector: 'app-admin-console',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-console.html',
  styleUrl: './admin-console.css'
})
export class AdminConsole {
  private generation = 0;
  readonly client = input.required<ProductClient>();
  readonly identity = input.required<string>();
  readonly status = input.required<string>();
  readonly allowed = signal(false);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly tab = signal<AdminTab>('users');
  readonly users = signal<AdminUser[]>([]);
  readonly content = signal<ContentPage>({ drafts: [], published: [] });
  readonly taskRows = signal<ReportRow[]>([]);
  readonly usage = signal<AdminUsage | null>(null);
  readonly audit = signal<AuditEntry[]>([]);
  readonly page = signal(1);
  readonly taskPage = signal(1);
  readonly template = signal<PromptTemplate | null>(null);
  readonly templateRevision = signal(0);
  readonly policy = signal<ProviderPolicy>({ version: 1, providers: [] });
  readonly policyRevision = signal(0);
  readonly policyActiveRevision = signal<number | null>(null);
  readonly userDetail = signal<AdminUser | null>(null);
  readonly filter = { userId: '', model: '', channel: '', status: '', from: '', to: '' };

  constructor() {
    effect(() => {
      const identity = this.identity(),
        status = this.status();
      untracked(() => {
        ++this.generation;
        this.busy.set(false);
        this.allowed.set(false);
        this.clear();
        if (identity && status === 'signed-in') void this.load();
        else this.message.set(status === 'checking' ? '正在验证账号…' : '请使用有效管理员账号登录。');
      });
    });
  }
  async load(): Promise<void> {
    await this.run(async () => {
      await this.client().admin('session');
      return this.readTab();
    });
  }
  async selectTab(tab: AdminTab): Promise<void> {
    if (this.busy()) return;
    this.tab.set(tab);
    await this.load();
  }
  async changePage(direction: number): Promise<void> {
    if (this.busy()) return;
    if (this.tab() === 'tasks') this.taskPage.update(page => Math.max(1, page + direction));
    else this.page.update(page => Math.max(1, page + direction));
    await this.load();
  }
  async setAccount(user: AdminUser): Promise<void> {
    if (!window.confirm(`${user.disabled ? '解除封禁' : '封禁'}此账号？本机文件不会被删除。`)) return;
    await this.run(async () => {
      const result = (await this.client().admin(`users/${user.id}`, 'PATCH', {
        disabled: !user.disabled,
        revision: user.revision,
        requestId: crypto.randomUUID()
      })) as { account: { auth_state: string } };
      const data = await this.readTab();
      return () => {
        data();
        this.message.set(
          result.account.auth_state === 'applied' ?
            '账号状态已确认。'
          : '产品状态已提交，登录限制待确认；请重新载入后核对。'
        );
      };
    });
  }
  editTemplate(row?: ContentRow): void {
    this.template.set(
      structuredClone(
        row ?
          validatePublishedTemplate(row.payload)
        : {
            ...imageMvpCatalog[0],
            id: 'new-template',
            title: '新模板',
            prompt: '描述你要创建的画面',
            rights: 'aiao-original-text-and-svg',
            image: '/prompt-art/coffee-launch.svg',
            source: 'Aiao 原创',
            author: 'Aiao',
            fields: [],
            templateDocument: undefined
          }
      )
    );
    this.templateRevision.set(row?.revision ?? 0);
  }
  setTemplateText(text: string): void {
    this.template.update(value => (value ? { ...value, prompt: text, templateDocument: undefined, fields: [] } : null));
  }
  async saveTemplate(): Promise<void> {
    const template = this.template();
    if (!template) return;
    await this.run(async () => {
      const payload = validatePublishedTemplate(JSON.parse(JSON.stringify(template)));
      const result = (await this.client().admin(`content/template/${template.id}`, 'PUT', {
        revision: this.templateRevision(),
        requestId: crypto.randomUUID(),
        payload
      })) as { content: ContentRow };
      const data = await this.readTab();
      return () => {
        data();
        this.templateRevision.set(result.content.revision);
        this.message.set('模板草稿已保存，尚未发布。');
      };
    });
  }
  async publish(row: ContentRow, withdraw = false): Promise<void> {
    await this.run(async () => {
      await this.client().admin(`content/${row.kind}/${row.key}/${withdraw ? 'withdraw' : 'publish'}`, 'POST', {
        revision: row.revision,
        requestId: crypto.randomUUID()
      });
      const data = await this.readTab();
      return () => {
        data();
        this.message.set(
          withdraw ? '已撤回发布版。'
          : row.kind === 'provider-policy' ? '运行策略已发布；下次代理请求按此版本校验。'
          : '模板已发布。'
        );
      };
    });
  }
  addPolicyProvider(): void {
    this.policy.update(policy => ({
      ...policy,
      providers: [
        ...policy.providers,
        {
          id: crypto.randomUUID(),
          name: '新供应商',
          baseUrl: '',
          models: [],
          sizes: ['1024x1024'],
          enabled: false,
          direct: false,
          proxy: false
        }
      ]
    }));
  }
  policyModels(provider: ProviderPolicyEntry, text: string): void {
    provider.models = text
      .split(',')
      .map(model => model.trim())
      .filter(Boolean);
  }
  async savePolicy(): Promise<void> {
    await this.run(async () => {
      const result = (await this.client().admin('content/provider-policy/runtime', 'PUT', {
        revision: this.policyRevision(),
        requestId: crypto.randomUUID(),
        payload: this.policy()
      })) as { content: ContentRow };
      const data = await this.readTab();
      return () => {
        data();
        this.policyRevision.set(result.content.revision);
        this.message.set('策略草稿已保存，运行版本尚未更改。');
      };
    });
  }
  policyRow(): ContentRow | undefined {
    return this.content().drafts.find(row => row.kind === 'provider-policy');
  }
  publishedRevision(row: ContentRow): number | null {
    return this.content().published.find(item => item.kind === row.kind && item.key === row.key)?.revision ?? null;
  }
  async searchTasks(): Promise<void> {
    this.taskPage.set(1);
    await this.load();
  }
  currencyList(bucket: UsageBucket): string {
    return (
      Object.entries(bucket.currencies)
        .map(([currency, amount]) => `${currency} ${amount}`)
        .join(' · ') || '未知'
    );
  }
  metric(value: number | null, unknown = 0): string {
    const known = value ?? '未知';
    return unknown ? `${known}（${unknown}条未知）` : String(known);
  }
  unknownMetric(bucket: UsageBucket, key: 'requestCount' | 'providerUnits' | 'verifiedCost'): string {
    const count = bucket.unknown?.[key] ?? 0;
    return count ? `（${count}条未知）` : '';
  }
  sourceLabel(source: string): string {
    return (
      ({ application: '应用上报', provider: '供应商回报', verified: '核验费用' } as Record<string, string>)[source] ??
      source
    );
  }

  private async run(operation: () => Promise<() => void>): Promise<void> {
    if (this.busy() || this.status() !== 'signed-in') return;
    const generation = this.generation;
    this.busy.set(true);
    this.message.set('');
    try {
      const apply = await operation();
      if (generation !== this.generation) return;
      this.allowed.set(true);
      apply();
    } catch (error) {
      if (generation !== this.generation) return;
      this.allowed.set(false);
      this.clear();
      this.message.set(error instanceof Error ? error.message : '后台请求未确认，请重新载入。');
    } finally {
      if (generation === this.generation) this.busy.set(false);
    }
  }
  private async readTab(): Promise<() => void> {
    if (this.tab() === 'users') {
      const data = (await this.client().admin(`users?page=${this.page()}&perPage=25`)) as { users: AdminUser[] };
      return () => {
        this.users.set(data.users);
        this.userDetail.set(null);
      };
    }
    if (['templates', 'policies'].includes(this.tab())) {
      const data = (await this.client().admin('content')) as ContentPage;
      return () => {
        this.content.set(data);
        const policy = data.drafts.find(row => row.kind === 'provider-policy');
        this.policy.set(policy ? structuredClone(policy.payload as ProviderPolicy) : { version: 1, providers: [] });
        this.policyRevision.set(policy?.revision ?? 0);
        this.policyActiveRevision.set(data.published.find(row => row.kind === 'provider-policy')?.revision ?? null);
      };
    }
    if (this.tab() === 'audit') {
      const data = (await this.client().admin('audit')) as { entries: AuditEntry[] };
      return () => this.audit.set(data.entries);
    }
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(this.filter)) if (value) query.set(key, value);
    const [tasks, usage] = await Promise.all([
      this.client().admin(`tasks?${query}&page=${this.taskPage()}`),
      this.client().admin(`usage?${query}`)
    ]);
    return () => {
      this.taskRows.set((tasks as { reports: ReportRow[] }).reports);
      this.usage.set(usage as AdminUsage);
    };
  }
  private clear(): void {
    this.users.set([]);
    this.content.set({ drafts: [], published: [] });
    this.taskRows.set([]);
    this.usage.set(null);
    this.audit.set([]);
    this.template.set(null);
    this.userDetail.set(null);
    this.policy.set({ version: 1, providers: [] });
    this.policyRevision.set(0);
    this.policyActiveRevision.set(null);
  }
}
