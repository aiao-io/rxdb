import type { CreditSnapshot, TaskReport } from '@aiao-media/api-contracts';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProductRequestError, type ProductClient } from './product-client';

interface AdminUser {
  id: string;
  email: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  disabled: boolean;
  revision: number;
  authState: string;
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
  receivedRecords: number;
  sources: Record<string, UsageBucket>;
  partial: boolean;
}
const releaseFields = {
  key: '标识',
  title: '标题',
  image: '封面',
  alt: '封面替代文本',
  author: '作者',
  source: '来源',
  rights: '使用依据'
} as const;
type ReleaseSnapshot = Partial<Record<keyof typeof releaseFields, string | null>>;
interface TemplateReleaseReceipt {
  actorName: string | null;
  message: string;
  templates: { key: string; before: ReleaseSnapshot | null; after: ReleaseSnapshot | null }[];
}

function releaseValue(field: keyof ReleaseSnapshot, value?: string | null): string {
  if (field === 'rights' && value === 'aiao-original-text-and-svg') return 'Aiao 原创';
  if (field === 'rights' && value === 'community-reference') return '社区参考';
  return value ?? '—';
}

function templateReleaseView(receipt: TemplateReleaseReceipt) {
  return {
    actorName: receipt.actorName,
    message: receipt.message,
    templates: receipt.templates.map(({ key, before, after }) => ({
      key,
      operation:
        before ?
          after ? '更新'
          : '撤下'
        : after ? '新增'
        : '已处于未公开状态',
      fields: (Object.keys(releaseFields) as (keyof ReleaseSnapshot)[])
        .filter(field => before?.[field] !== after?.[field])
        .map(field => ({
          label: releaseFields[field],
          before: releaseValue(field, before?.[field]),
          after: releaseValue(field, after?.[field])
        }))
    }))
  };
}
interface AuditEntry {
  id: number;
  actor_id: string;
  action: string;
  target_id: string;
  created_at: string;
  release?: ReturnType<typeof templateReleaseView>;
}
export type AdminTab = 'users' | 'templates' | 'policies' | 'platforms' | 'tasks' | 'audit';

@Component({
  selector: 'app-admin-console',
  imports: [FormsModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-console.html',
  styleUrl: './admin-console.css'
})
export class AdminConsole {
  private generation = 0;
  private creditPending: { target: string; delta: number; reason: string; requestId: string } | null = null;
  readonly client = input.required<ProductClient>();
  readonly identity = input.required<string>();
  readonly status = input.required<string>();
  readonly routeTab = input<AdminTab>();
  readonly tabChange = output<AdminTab>();
  readonly allowed = signal(false);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly tab = signal<AdminTab>('users');
  readonly users = signal<AdminUser[]>([]);
  readonly taskRows = signal<ReportRow[]>([]);
  readonly usage = signal<AdminUsage | null>(null);
  readonly audit = signal<AuditEntry[]>([]);
  readonly page = signal(1);
  userSearch = '';
  readonly taskPage = signal(1);
  readonly userDetail = signal<AdminUser | null>(null);
  readonly credits = signal<CreditSnapshot | null>(null);
  readonly creditHistory = signal(false);
  readonly timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  readonly creditForm = { delta: 0, reason: '' };
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
    effect(() => {
      const routeTab = this.routeTab();
      if (!routeTab || routeTab === this.tab()) return;
      untracked(() => {
        this.tab.set(routeTab);
        if (this.status() === 'signed-in') void this.load();
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
    this.tabChange.emit(tab);
    await this.load();
  }
  async changePage(direction: number): Promise<void> {
    if (this.busy()) return;
    if (this.tab() === 'tasks') this.taskPage.update(page => Math.max(1, page + direction));
    else this.page.update(page => Math.max(1, page + direction));
    await this.load();
  }
  async searchUsers(): Promise<void> {
    this.page.set(1);
    await this.load();
  }
  async openUser(user: AdminUser): Promise<void> {
    if (this.busy()) return;
    this.userDetail.set(user);
    this.credits.set(null);
    this.creditHistory.set(false);
    this.creditForm.delta = 0;
    this.creditForm.reason = '';
    await this.run(async () => {
      const value = (await this.client().admin(`users/${user.id}/credits`)) as CreditSnapshot;
      return () => this.credits.set(value);
    }, true);
  }
  async olderCredits(): Promise<void> {
    const user = this.userDetail(),
      entries = this.credits()?.entries;
    if (!user || !entries?.length) return;
    await this.run(async () => {
      const value = (await this.client().admin(
        `users/${user.id}/credits?before=${entries[entries.length - 1].id}`
      )) as CreditSnapshot;
      return () => {
        this.credits.set(value);
        this.creditHistory.set(true);
      };
    }, true);
  }
  async adjustCredits(): Promise<void> {
    const user = this.userDetail(),
      delta = this.creditForm.delta,
      reason = this.creditForm.reason.trim();
    if (!user || this.busy()) return;
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 2147483647 || !reason || reason.length > 500) {
      this.message.set('请填写非零整数积分和调整原因。');
      return;
    }
    if (
      !this.creditPending ||
      this.creditPending.target !== user.id ||
      this.creditPending.delta !== delta ||
      this.creditPending.reason !== reason
    )
      this.creditPending = { target: user.id, delta, reason, requestId: crypto.randomUUID() };
    const pending = this.creditPending;
    await this.run(async () => {
      await this.client().admin(`users/${user.id}/credits`, 'POST', { delta, reason, requestId: pending.requestId });
      const value = (await this.client().admin(`users/${user.id}/credits`)) as CreditSnapshot;
      return () => {
        this.credits.set(value);
        this.creditHistory.set(false);
        this.creditPending = null;
        this.creditForm.delta = 0;
        this.creditForm.reason = '';
        this.message.set('积分调整已确认。');
      };
    }, true);
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
          : '产品状态已提交，登录限制待确认；请稍后重试核对。'
        );
      };
    });
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

  private async run(operation: () => Promise<() => void>, preserve = false): Promise<void> {
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
      if (!preserve || (error instanceof ProductRequestError && [401, 403].includes(error.status))) {
        this.allowed.set(false);
        this.clear();
      }
      this.message.set(error instanceof Error ? error.message : '后台请求未确认，请重试。');
    } finally {
      if (generation === this.generation) this.busy.set(false);
    }
  }
  private async readTab(): Promise<() => void> {
    if (this.tab() === 'users') {
      const data = (await this.client().admin(
        `users?page=${this.page()}&perPage=25${this.userSearch.trim() ? `&search=${encodeURIComponent(this.userSearch.trim())}` : ''}`
      )) as { users: AdminUser[] };
      return () => {
        this.users.set(Array.isArray(data.users) ? data.users : []);
        this.userDetail.set(null);
        this.credits.set(null);
      };
    }
    if (['templates', 'policies'].includes(this.tab())) return () => undefined;
    if (this.tab() === 'audit') {
      const data = (await this.client().admin('audit')) as {
        entries: (AuditEntry & { after_data?: TemplateReleaseReceipt | null })[];
      };
      const entries = data.entries.map(({ after_data, ...entry }) =>
        entry.action === 'template-commit-release' && Array.isArray(after_data?.templates) ?
          { ...entry, release: templateReleaseView(after_data) }
        : entry
      );
      return () => this.audit.set(entries);
    }
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(this.filter)) {
      if (!value) continue;
      const time = (key === 'from' || key === 'to') && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value);
      query.set(key, time ? new Date(value).toISOString() : value);
    }
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
    this.taskRows.set([]);
    this.usage.set(null);
    this.audit.set([]);
    this.userDetail.set(null);
    this.credits.set(null);
    this.creditPending = null;
    this.creditHistory.set(false);
  }
}
