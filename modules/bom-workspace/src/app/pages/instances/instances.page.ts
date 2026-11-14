import type { BomInstanceTraceResult, BomInstanceTreeResult } from '@aiao/rxdb-plugin-bom';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BomDemoService, type BomDemoOutcome } from '../../bom-demo.service';
import { materialLabel } from '../../presentation/material-label';

/** 独立于主数据的实际装机、安装历史与追溯页面。 */
@Component({
  selector: 'bom-instances-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './instances.page.html',
  styleUrl: './instances.page.scss'
})
export class InstancesPage {
  private readonly service = inject(BomDemoService);
  private request = 0;
  private stateRequest = 0;
  readonly materialLabel = materialLabel;

  readonly ready = this.service.ready;
  readonly roots = this.service.instanceRoots;
  readonly rootId = signal(this.service.firstInstanceId);
  readonly asOfDate = signal('2026-10-17');
  readonly history = signal(false);
  readonly tree = signal<BomInstanceTreeResult | null>(null);
  readonly trace = signal<BomInstanceTraceResult | null>(null);
  readonly traceKind = signal<'serial' | 'lot'>('lot');
  readonly traceValue = signal('PACK-LOT-A');
  readonly replaceDate = signal('2026-11-01');
  readonly masterDate = signal('2099-01-01');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly actionResult = signal('');
  readonly masterResult = signal('');
  readonly sourceResult = signal<BomDemoOutcome | null>(null);
  readonly replaced = signal(false);
  readonly revised = signal(false);
  readonly stateLoading = signal(true);
  readonly firstInstanceId = this.service.firstInstanceId;
  readonly protectedSourceId = this.service.protectedInstanceSourceId;
  readonly treeQuery = signal<{ root: string; date: string; history: boolean } | null>(null);
  readonly traceQuery = signal<{ kind: 'serial' | 'lot'; value: string; date: string; history: boolean } | null>(null);
  readonly treeStale = computed(() => {
    const query = this.treeQuery();
    return (
      query !== null &&
      (query.root !== this.rootId() ||
        query.history !== this.history() ||
        (!query.history && query.date !== this.asOfDate()))
    );
  });
  readonly traceStale = computed(() => {
    const query = this.traceQuery();
    return (
      query !== null &&
      (query.kind !== this.traceKind() ||
        query.value !== this.traceValue() ||
        query.history !== this.history() ||
        (!query.history && query.date !== this.asOfDate()))
    );
  });

  constructor() {
    effect(() => {
      const epoch = this.service.dataEpoch();
      const ready = this.ready();
      const resetting = this.service.resetting();
      this.request += 1;
      this.stateRequest += 1;
      this.tree.set(null);
      this.trace.set(null);
      this.treeQuery.set(null);
      this.traceQuery.set(null);
      this.error.set('');
      this.actionResult.set('');
      this.masterResult.set('');
      this.sourceResult.set(null);
      this.replaced.set(false);
      this.revised.set(false);
      this.stateLoading.set(ready && !resetting);
      this.busy.set(false);
      if (ready && !resetting) void this.restoreState(epoch);
    });
  }

  /** 日期只取安装事实的显式时间，不解析来源发生项。 */
  date(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  /** 用物料中文名与编号呈现实际安装路径。 */
  tracePath(match: BomInstanceTraceResult['matches'][number]): string {
    return match.path.map(node => materialLabel(node.itemNo)).join(' → ');
  }

  /** 当前安装与全历史共用实例查询合同。 */
  async loadTree(): Promise<void> {
    if (this.busy() || !this.ready()) return;
    const current = this.beginRequest();
    const query = { root: this.rootId(), date: this.asOfDate(), history: this.history() };
    this.error.set('');
    this.tree.set(null);
    this.treeQuery.set(null);
    try {
      const tree = await this.service.instanceTree(query.root, query.history ? undefined : query.date);
      if (!current()) return;
      this.tree.set(tree);
      this.treeQuery.set(query);
    } catch (error) {
      if (current()) this.error.set(String(error));
    } finally {
      if (current()) this.busy.set(false);
    }
  }

  /** 序列号与批次反查返回实际命中记录及其整机路径。 */
  async runTrace(): Promise<void> {
    if (this.busy() || !this.ready()) return;
    const current = this.beginRequest();
    const query = { kind: this.traceKind(), value: this.traceValue(), date: this.asOfDate(), history: this.history() };
    this.error.set('');
    this.trace.set(null);
    this.traceQuery.set(null);
    try {
      const trace = await this.service.traceInstance(query.kind, query.value, query.history ? undefined : query.date);
      if (!current()) return;
      this.trace.set(trace);
      this.traceQuery.set(query);
    } catch (error) {
      if (current()) this.error.set(String(error));
    } finally {
      if (current()) this.busy.set(false);
    }
  }

  /** 演示按时间截止旧安装，再追加新安装。 */
  async replace(): Promise<void> {
    if (this.busy() || !this.ready() || this.replaced() || this.rootId() !== this.firstInstanceId) return;
    const date = this.replaceDate();
    if (
      !window.confirm(
        `确认在 ${date} 为电动滑板车（SC-100）SN-001 更换电池组（BATT）？PACK-001 的安装将截止，PACK-003 同日开始安装，旧记录保留。`
      )
    )
      return;
    const current = this.beginRequest();
    this.stateRequest += 1;
    this.error.set('');
    this.actionResult.set('');
    try {
      await this.service.replaceDemoInstance(date);
      if (!current()) return;
      this.replaced.set(true);
      this.tree.set(null);
      this.trace.set(null);
      this.treeQuery.set(null);
      this.traceQuery.set(null);
      this.asOfDate.set(date);
      this.history.set(false);
      this.actionResult.set(`换件成功：PACK-001 截止于 ${date}，PACK-003 同时开始安装。`);
      const tree = await this.service.instanceTree(this.firstInstanceId, date);
      if (!current()) return;
      this.tree.set(tree);
      this.treeQuery.set({ root: this.firstInstanceId, date, history: false });
    } catch (error) {
      if (current()) this.error.set(String(error));
    } finally {
      if (current()) this.busy.set(false);
    }
  }

  /** 新发布主数据修订不修改已经保存的实例事实。 */
  async reviseMaster(): Promise<void> {
    if (this.busy() || !this.ready() || this.revised()) return;
    const current = this.beginRequest();
    this.stateRequest += 1;
    this.error.set('');
    this.masterResult.set('');
    try {
      const result = await this.service.reviseDemoInstanceMaster(this.masterDate());
      if (!current()) return;
      this.masterResult.set(result);
      this.revised.set(true);
    } catch (error) {
      if (current()) this.error.set(String(error));
    } finally {
      if (current()) this.busy.set(false);
    }
  }

  /** 直连删除草稿来源，读取后端给出的引用保护错误。 */
  async deleteSource(): Promise<void> {
    if (this.busy() || !this.ready()) return;
    if (
      !window.confirm('确认尝试删除 SN-002 的草稿来源？该来源已被安装记录引用，系统应拒绝删除；请核对返回的保护结果。')
    )
      return;
    const current = this.beginRequest();
    this.error.set('');
    this.sourceResult.set(null);
    try {
      const outcome = await this.service.deleteDemoInstanceSource();
      if (current()) this.sourceResult.set(outcome);
    } catch (error) {
      if (current()) this.error.set(String(error));
    } finally {
      if (current()) this.busy.set(false);
    }
  }

  private beginRequest(): () => boolean {
    const epoch = this.service.dataEpoch();
    const request = ++this.request;
    this.busy.set(true);
    return () =>
      request === this.request && epoch === this.service.dataEpoch() && this.ready() && !this.service.resetting();
  }

  private async restoreState(epoch: number): Promise<void> {
    const request = ++this.stateRequest;
    try {
      const state = await this.service.readDemoInstanceState();
      if (
        epoch !== this.service.dataEpoch() ||
        request !== this.stateRequest ||
        !this.ready() ||
        this.service.resetting()
      )
        return;
      this.replaced.set(state.replacementDate !== null);
      this.revised.set(state.masterRevised);
      if (state.replacementDate === null) return;
      this.replaceDate.set(state.replacementDate);
      this.actionResult.set(`已记录换件：PACK-001 截止于 ${state.replacementDate}，PACK-003 同时开始安装。`);
    } catch (error) {
      if (
        epoch === this.service.dataEpoch() &&
        request === this.stateRequest &&
        this.ready() &&
        !this.service.resetting()
      )
        this.error.set(`读取已保存操作状态失败：${String(error)}`);
    } finally {
      if (
        epoch === this.service.dataEpoch() &&
        request === this.stateRequest &&
        this.ready() &&
        !this.service.resetting()
      )
        this.stateLoading.set(false);
    }
  }
}
