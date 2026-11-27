import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import {
  BotMessageSquare,
  Code2,
  FileCode2,
  LucideAngularModule,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Redo2,
  Undo2
} from 'lucide-angular';
import { MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import type { ViewMode } from '../../interfaces/designer.interface';

/**
 * 设计器工具栏组件
 *
 * 提供当前实体名显示（未选中实体时回退为模型名）、视图切换、添加实体、
 * 代码生成、撤销/重做、AI 触发等功能。
 */
@Component({
  selector: 'lib-designer-toolbar',
  imports: [LucideAngularModule],
  templateUrl: './designer-toolbar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DesignerToolbarComponent {
  protected readonly Undo2 = Undo2;
  protected readonly Redo2 = Redo2;
  protected readonly BotMessageSquare = BotMessageSquare;
  protected readonly Code2 = Code2;
  protected readonly FileCode2 = FileCode2;
  protected readonly MoreHorizontal = MoreHorizontal;
  protected readonly PanelLeft = PanelLeft;
  protected readonly Plus = Plus;
  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);
  /** 工具栏主标题：优先当前实体名，未选中实体时回退为模型名 */
  protected readonly displayName = computed(() => this.entityName() ?? this.modelName() ?? this.t().toolbar.untitled);

  readonly modelName = input<string>();
  /** 当前选中实体名（只读展示，不再承担切换入口） */
  readonly entityName = input<string>();
  readonly viewMode = input<ViewMode>('canvas');
  readonly undoCount = input(0);
  readonly redoCount = input(0);
  readonly undoDisabled = input(true);
  readonly redoDisabled = input(true);
  readonly entityCount = input(0);
  readonly isOffline = input(false);
  readonly viewModeChange = output<ViewMode>();
  readonly addEntity = output<void>();
  readonly generateCode = output<void>();
  readonly generateSql = output<void>();
  readonly undo = output<void>();
  readonly redo = output<void>();
  readonly toggleAi = output<void>();
  readonly openNavigator = output<void>();

  protected closeMobileActions(details: HTMLDetailsElement): void {
    details.open = false;
  }
}
