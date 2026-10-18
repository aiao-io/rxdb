import type { BomInstanceTraceResult, BomInstanceTreeResult } from '@aiao/rxdb-plugin-bom';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BomDemoService } from '../../bom-demo.service';

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
  readonly sourceResult = signal('');
  readonly replaced = signal(false);
  readonly revised = signal(false);
  readonly firstInstanceId = this.service.firstInstanceId;
  readonly protectedSourceId = this.service.protectedInstanceSourceId;

  constructor() {
    effect(() => {
      if (this.ready()) return;
      this.tree.set(null);
      this.trace.set(null);
      this.error.set('');
      this.actionResult.set('');
      this.masterResult.set('');
      this.sourceResult.set('');
      this.replaced.set(false);
      this.revised.set(false);
    });
  }

  /** 日期只取安装事实的显式时间，不解析来源发生项。 */
  date(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  /** 用物料编号呈现实际安装路径。 */
  tracePath(match: BomInstanceTraceResult['matches'][number]): string {
    return match.path.map(node => node.itemNo).join(' → ');
  }

  /** 当前安装与全历史共用实例查询合同。 */
  async loadTree(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.tree.set(null);
    try {
      this.tree.set(await this.service.instanceTree(this.rootId(), this.history() ? undefined : this.asOfDate()));
    } catch (error) {
      this.error.set(String(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** 序列号与批次反查返回实际命中记录及其整机路径。 */
  async runTrace(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.trace.set(null);
    try {
      this.trace.set(
        await this.service.traceInstance(
          this.traceKind(),
          this.traceValue(),
          this.history() ? undefined : this.asOfDate()
        )
      );
    } catch (error) {
      this.error.set(String(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** 演示按时间截止旧安装，再追加新安装。 */
  async replace(): Promise<void> {
    if (
      !window.confirm(
        `确认在 ${this.replaceDate()} 为 SN-001 换件？PACK-001 的安装将截止，PACK-003 同日开始安装，旧记录保留。`
      )
    )
      return;
    this.busy.set(true);
    this.error.set('');
    this.actionResult.set('');
    try {
      await this.service.replaceDemoInstance(this.replaceDate());
      this.replaced.set(true);
      this.tree.set(null);
      this.trace.set(null);
      this.actionResult.set(`换件成功：PACK-001 截止于 ${this.replaceDate()}，PACK-003 同时开始安装。`);
    } catch (error) {
      this.error.set(String(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** 新发布主数据修订不修改已经保存的实例事实。 */
  async reviseMaster(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.masterResult.set('');
    try {
      this.masterResult.set(await this.service.reviseDemoInstanceMaster(this.masterDate()));
      this.revised.set(true);
    } catch (error) {
      this.error.set(String(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** 直连删除草稿来源，读取后端给出的引用保护错误。 */
  async deleteSource(): Promise<void> {
    if (
      !window.confirm('确认尝试删除 SN-002 的草稿来源？该来源已被安装记录引用，系统应拒绝删除；请核对返回的保护结果。')
    )
      return;
    this.busy.set(true);
    this.error.set('');
    this.sourceResult.set('');
    try {
      this.sourceResult.set(await this.service.deleteDemoInstanceSource());
    } catch (error) {
      this.error.set(String(error));
    } finally {
      this.busy.set(false);
    }
  }
}
