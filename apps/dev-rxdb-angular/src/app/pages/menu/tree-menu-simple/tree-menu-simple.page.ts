import { RxDB } from '@aiao/rxdb';
import { useFindAll } from '@aiao/rxdb-angular';
import { MenuSimple } from '@aiao/rxdb-test/entities';
import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideChevronDown as ChevronDown,
  LucideChevronRight as ChevronRight,
  LucideChevronsDown as ChevronsDown,
  LucideChevronsUp as ChevronsUp,
  LucideGripVertical as GripVertical,
  LucideHistory as History,
  LucideDynamicIcon,
  LucidePen as Pen,
  LucidePlus as Plus,
  LucideRedo2 as Redo2,
  LucideSearch as Search,
  LucideTrash2 as Trash2,
  LucideTriangleAlert as TriangleAlert,
  LucideUndo2 as Undo2,
  LucideX as X
} from '@lucide/angular';
import { HistorySidebarComponent } from '@modules/angular';
import { TreeMenuDragDropBase } from '../utils/tree-menu.drag-drop';

/**
 * MenuTreeBasic 组件 - 场景1：小数据量（< 100 节点）
 *
 * 特性：
 * - 全量加载所有菜单数据
 * - 标准 DOM 渲染（无虚拟滚动）
 * - hasChildren 在内存中计算
 * - 支持基础 CRUD 操作
 */
@Component({
  selector: 'app-tree-menu-simple-page',
  templateUrl: './tree-menu-simple.page.html',
  styleUrls: ['./tree-menu-simple.page.scss'],
  host: { class: 'page-host' },
  imports: [FormsModule, LucideDynamicIcon, AsyncPipe, HistorySidebarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class MenuTreePage extends TreeMenuDragDropBase<typeof MenuSimple> {
  // Icons
  readonly ChevronRight = ChevronRight;
  readonly ChevronDown = ChevronDown;
  readonly ChevronsDown = ChevronsDown;
  readonly ChevronsUp = ChevronsUp;
  readonly Pen = Pen;
  readonly Plus = Plus;
  readonly Trash2 = Trash2;
  readonly X = X;
  readonly TriangleAlert = TriangleAlert;
  readonly GripVertical = GripVertical;
  readonly Undo2 = Undo2;
  readonly Redo2 = Redo2;
  readonly History = History;
  readonly Search = Search;

  constructor() {
    const rxdb = inject(RxDB);
    super(
      useFindAll(MenuSimple, {
        where: { combinator: 'and', rules: [] },
        orderBy: [{ field: 'sortOrder', sort: 'asc' }]
      }),
      MenuSimple,
      rxdb.versionManager.history(MenuSimple)
    );
  }
}
