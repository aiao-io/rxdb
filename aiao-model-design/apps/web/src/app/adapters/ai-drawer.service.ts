import { computed, Injectable, signal, TemplateRef } from '@angular/core';

/**
 * AI 抽屉默认面板（未注册页面级内容时）的 tab 类型
 */
export type AiDrawerTab = 'assistant' | 'docs';

/**
 * AI 抽屉状态管理服务
 *
 * 管理右侧 AI 抽屉的开关状态、内容注入、路由感知。
 */
@Injectable({ providedIn: 'root' })
export class AiDrawerService {
  /** 抽屉开/关状态 */
  readonly isOpen = signal(false);

  /** 当前页面是否支持 AI 功能 */
  readonly hasAiCapability = signal(false);

  /** 默认面板当前激活的 tab（assistant / docs） */
  readonly activeTab = signal<AiDrawerTab>('assistant');

  /** 页面级内容模板 */
  readonly contentTemplate = signal<TemplateRef<unknown> | null>(null);

  /** 抽屉宽度 */
  readonly drawerWidth = signal(400);

  /** 是否有已注册的内容 */
  readonly hasContent = computed(() => this.contentTemplate() !== null);

  /** 打开抽屉 */
  open() {
    this.isOpen.set(true);
  }

  /** 关闭抽屉 */
  close() {
    this.isOpen.set(false);
  }

  /** 切换抽屉开关 */
  toggle() {
    this.isOpen.update(v => !v);
  }

  /** 切换默认面板 tab */
  setActiveTab(tab: AiDrawerTab) {
    this.activeTab.set(tab);
  }

  /**
   * 注册页面级 AI 面板内容
   *
   * 由页面组件调用（如 designer.component），配合 @defer 异步挂载。
   */
  registerContent(templateRef: TemplateRef<unknown>) {
    this.contentTemplate.set(templateRef);
    this.hasAiCapability.set(true);
  }

  /** 清理页面级内容 */
  clearContent() {
    this.contentTemplate.set(null);
    this.hasAiCapability.set(false);
  }
}
