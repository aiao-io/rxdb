import { computed, inject, Injectable, OnDestroy, signal } from '@angular/core';
import { logger } from '@aiao/rxdb-devtools-panel/wire';
import { ToastService } from '../components/toast.component';
import { DEVTOOLS_TRANSPORT } from '../transport';
import type { Branch, SerializedEvent } from '../types/devtools.types';
import { DatabaseStateService } from './database-state.service';

const MAX_EVENTS = 1000;

class EventRingBuffer {
  private readonly slots = new Array<SerializedEvent | undefined>(MAX_EVENTS);
  private start = 0;
  private size = 0;

  get length(): number {
    return this.size;
  }

  push(event: SerializedEvent): boolean {
    const grew = this.size < MAX_EVENTS;
    const index = (this.start + this.size) % MAX_EVENTS;
    if (grew) {
      this.size++;
    } else {
      this.start = (this.start + 1) % MAX_EVENTS;
    }
    this.slots[index] = event;
    return grew;
  }

  at(index: number): SerializedEvent | undefined {
    if (index < 0 || index >= this.size) return undefined;
    return this.slots[(this.start + index) % MAX_EVENTS];
  }

  toArray(): SerializedEvent[] {
    return Array.from({ length: this.size }, (_, index) => this.at(index)).filter(
      (event): event is SerializedEvent => event !== undefined
    );
  }

  clear(): void {
    this.start = 0;
    this.size = 0;
  }
}

/**
 * DevTools 全局状态管理服务
 */
@Injectable({ providedIn: 'root' })
export class DevToolsStateService implements OnDestroy {
  private readonly transport = inject(DEVTOOLS_TRANSPORT);
  private readonly toastService = inject(ToastService);
  private readonly dbState = inject(DatabaseStateService);
  private unsubscribe: (() => void) | null = null;
  private readonly eventBuffer = new EventRingBuffer();
  private readonly eventVersion = signal(0);
  private readonly indexes: number[] = [];

  /** 连接状态 */
  readonly connected = signal(false);

  /** 事件列表 */
  readonly events = computed(() => {
    this.eventVersion();
    return this.eventBuffer.toArray();
  });

  /** 虚拟列表使用的稳定逻辑下标，不复制事件对象。 */
  readonly eventIndexes = signal<readonly number[]>(this.indexes, { equal: () => false });

  /** 选中的事件 */
  readonly selectedEvent = signal<SerializedEvent | null>(null);

  /** 分支列表 */
  readonly branches = signal<Branch[]>([]);

  /** 当前激活的分支 */
  readonly activeBranch = computed(() => this.branches().find(b => b.activated) ?? null);

  /** 是否正在切换分支 */
  readonly switching = signal(false);

  constructor() {
    this.setupMessageListener();
  }

  ngOnDestroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  /**
   * 选中事件
   */
  selectEvent(event: SerializedEvent | null): void {
    this.selectedEvent.set(event);
  }

  /**
   * 清空事件列表
   */
  clearEvents(): void {
    this.clearEventBuffer();
    this.selectedEvent.set(null);
  }

  /**
   * 切换分支
   */
  switchBranch(branchId: string): void {
    this.switching.set(true);
    this.transport.sendMessage('SWITCH_BRANCH', branchId);
  }

  /**
   * 创建分支
   */
  createBranch(name: string): void {
    this.transport.sendMessage('CREATE_BRANCH', name);
  }

  /**
   * 删除分支
   */
  deleteBranch(branchId: string): void {
    this.transport.sendMessage('DELETE_BRANCH', branchId);
  }

  /**
   * 请求分支列表
   */
  requestBranches(): void {
    this.transport.sendMessage('GET_BRANCHES');
  }

  private setupMessageListener(): void {
    this.unsubscribe = this.transport.subscribe(message => {
      switch (message.type) {
        case 'HANDSHAKE':
          this.handleHandshake();
          break;
        case 'DISCONNECT':
          this.handleDisconnect();
          break;
        case 'EVENT':
          this.handleEvent(message.payload as SerializedEvent);
          break;
        case 'BRANCHES':
          this.handleBranches(message.payload as Branch[]);
          break;
        case 'BRANCH_SWITCHED':
          this.handleBranchSwitched();
          break;
        case 'BRANCH_CREATED':
          this.handleBranchCreated();
          break;
        case 'BRANCH_DELETED':
          this.handleBranchDeleted();
          break;
        case 'ERROR':
          this.handleError(message.payload as { message: string });
          break;
      }
    });
  }

  private handleHandshake(): void {
    logger.info('Handshake received');
    this.connected.set(true);
    this.requestBranches();
    this.dbState.inspectDb();
  }

  private handleDisconnect(): void {
    logger.info('Disconnect received');
    this.connected.set(false);
    this.clearEventBuffer();
    this.selectedEvent.set(null);
    this.branches.set([]);
    this.switching.set(false);
    this.dbState.reset();
  }

  private handleEvent(event: SerializedEvent): void {
    if (this.eventBuffer.push(event)) {
      this.indexes.push(this.eventBuffer.length - 1);
      this.eventIndexes.set(this.indexes);
    }
    this.eventVersion.update(version => version + 1);
  }

  /** 按最旧到最新的逻辑下标读取环形缓冲中的事件。 */
  eventAt(index: number): SerializedEvent | undefined {
    this.eventVersion();
    return this.eventBuffer.at(index);
  }

  private clearEventBuffer(): void {
    this.eventBuffer.clear();
    this.indexes.length = 0;
    this.eventIndexes.set(this.indexes);
    this.eventVersion.update(version => version + 1);
  }

  private handleBranches(branches: Branch[]): void {
    this.branches.set(branches);
    this.switching.set(false);
  }

  private handleBranchSwitched(): void {
    this.switching.set(false);
    this.requestBranches();
    this.dbState.inspectDb();
    this.toastService.success('Branch switched successfully');
  }

  private handleBranchCreated(): void {
    this.requestBranches();
    this.toastService.success('Branch created successfully');
  }

  private handleBranchDeleted(): void {
    this.requestBranches();
    this.toastService.success('Branch deleted successfully');
  }

  private handleError(payload: { message: string }): void {
    this.switching.set(false);
    this.toastService.error(payload.message || 'An error occurred');
  }
}
