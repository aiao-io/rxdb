import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { Box, Boxes, Check, ChevronsUpDown, LucideAngularModule } from 'lucide-angular';
import { MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import type { ModelDesign } from '../../models/index.js';

/**
 * 模型切换器组件
 *
 * 位于左侧 Schema 导航顶部：显示当前模型名（点击进入重命名编辑态），
 * 右侧下拉按钮提供切换模型与新建模型入口。
 */
@Component({
  selector: 'lib-model-switcher',
  imports: [LucideAngularModule],
  templateUrl: './model-switcher.component.html',
  styleUrl: './model-switcher.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelSwitcherComponent {
  protected readonly Box = Box;
  protected readonly Boxes = Boxes;
  protected readonly Check = Check;
  protected readonly ChevronsUpDown = ChevronsUpDown;
  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);

  /** 全部模型设计 */
  readonly models = input<ModelDesign[]>([]);
  /** 当前激活的模型设计 ID */
  readonly activeId = input<string | null>(null);

  readonly modelSelected = output<string>();
  readonly modelCreated = output<string>();
  readonly modelRenamed = output<string>();

  /** 下拉菜单是否打开 */
  readonly menuOpen = signal(false);
  /** 是否处于重命名编辑态 */
  readonly editing = signal(false);
  /** 重命名输入框的当前值 */
  readonly editValue = signal('');
  /** 新建模型的输入值 */
  readonly newName = signal('');

  readonly activeModel = computed(() => this.models().find(m => m.id === this.activeId()) ?? null);

  asInputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  /** 点击模型名 → 进入重命名编辑态 */
  startRename(): void {
    this.editValue.set(this.activeModel()?.name ?? '');
    this.editing.set(true);
  }

  /** 提交重命名：空值忽略，退出编辑态 */
  commitRename(): void {
    if (!this.editing()) return;
    const name = this.editValue().trim();
    if (name) this.modelRenamed.emit(name);
    this.editing.set(false);
  }

  /** 取消重命名：退出编辑态，不提交 */
  cancelRename(): void {
    this.editing.set(false);
  }

  /** 选择模型 → 切换并关闭菜单 */
  onSelect(id: string): void {
    this.modelSelected.emit(id);
    this.menuOpen.set(false);
  }

  /** 新建模型：空值忽略，成功后关闭菜单并清空输入 */
  onCreate(): void {
    const name = this.newName().trim();
    if (!name) return;
    this.modelCreated.emit(name);
    this.newName.set('');
    this.menuOpen.set(false);
  }
}
