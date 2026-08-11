import { RxDB } from '@aiao/rxdb';
import { useFindAll } from '@aiao/rxdb-angular';
import { FileNode } from '@aiao/rxdb-test/entities';
import { AsyncPipe, CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideChevronDown as ChevronDown,
  LucideChevronRight as ChevronRight,
  LucideChevronsDown as ChevronsDown,
  LucideChevronsUp as ChevronsUp,
  LucideFile as File,
  LucideFileArchive as FileArchive,
  LucideFileAudio as FileAudio,
  LucideFileCode as FileCode,
  LucideFileImage as FileImage,
  LucideFileText as FileText,
  LucideFileVideo as FileVideo,
  LucideFolder as Folder,
  LucideFolderOpen as FolderOpen,
  LucideHistory as History,
  LucideDynamicIcon,
  LucidePen as Pen,
  LucidePlus as Plus,
  LucideRedo2 as Redo2,
  LucideSearch as Search,
  LucideTrash2 as Trash2,
  LucideUndo2 as Undo2,
  LucideX as X
} from '@lucide/angular';
import { HistorySidebarComponent } from '@modules/angular';
import { FileDragDropService } from '../services/file-drag-drop.service';
import { FilePathValidatorService } from '../services/file-path-validator.service';
import { TreeFileDragDropBase } from '../utils/tree-file-drag-drop.base';
import { TreeFileDragDropStore } from '../utils/tree-file.store';

/**
 * FileManagerSimple 组件 - 简单版本
 *
 * 特性：
 * - 普通列表渲染（适合小数据量）
 * - 支持完整 CRUD + 拖拽 + 搜索功能
 * - 适用于 < 1000 节点的场景
 */
@Component({
  selector: 'app-file-manager-simple-page',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideDynamicIcon, AsyncPipe, HistorySidebarComponent],
  providers: [FilePathValidatorService],
  templateUrl: './file-manager-simple.page.html',
  styleUrl: './file-manager-simple.page.scss',
  host: { class: 'page-host' }
})
export default class FileManagerSimplePage extends TreeFileDragDropBase<typeof FileNode> {
  // Lucide icons
  readonly ChevronDown = ChevronDown;
  readonly ChevronRight = ChevronRight;
  readonly ChevronsDown = ChevronsDown;
  readonly ChevronsUp = ChevronsUp;
  readonly Folder = Folder;
  readonly FolderOpen = FolderOpen;
  readonly File = File;
  readonly Plus = Plus;
  readonly Pen = Pen;
  readonly Trash2 = Trash2;
  readonly X = X;
  readonly Search = Search;
  readonly Undo2 = Undo2;
  readonly Redo2 = Redo2;
  readonly History = History;
  readonly FileText = FileText;
  readonly FileCode = FileCode;
  readonly FileImage = FileImage;
  readonly FileVideo = FileVideo;
  readonly FileAudio = FileAudio;
  readonly FileArchive = FileArchive;

  // 常用文件扩展名选项
  readonly extensionOptions = [
    { value: '.txt', label: '.txt (文本)', icon: FileText },
    { value: '.md', label: '.md (Markdown)', icon: FileText },
    { value: '.json', label: '.json (JSON)', icon: FileCode },
    { value: '.js', label: '.js (JavaScript)', icon: FileCode },
    { value: '.ts', label: '.ts (TypeScript)', icon: FileCode },
    { value: '.html', label: '.html (HTML)', icon: FileCode },
    { value: '.css', label: '.css (CSS)', icon: FileCode },
    { value: '.jpg', label: '.jpg (图片)', icon: FileImage },
    { value: '.png', label: '.png (图片)', icon: FileImage },
    { value: '.pdf', label: '.pdf (PDF)', icon: FileText },
    { value: '.zip', label: '.zip (压缩包)', icon: FileArchive }
  ];

  constructor() {
    const rxdb = inject(RxDB);
    const fileResource = useFindAll(FileNode, {
      where: { combinator: 'and', rules: [] },
      orderBy: [{ field: 'sortOrder', sort: 'asc' }]
    });
    const history = rxdb.versionManager.history(FileNode);
    const store = new TreeFileDragDropStore(
      rxdb,
      inject(FilePathValidatorService),
      inject(FileDragDropService),
      fileResource,
      FileNode,
      history
    );

    super(store, fileResource, FileNode, history);
  }

  getDisplayName(node: FileNode): string {
    if (node.type === 'folder') return node.name;
    if (!node.extension) return node.name;
    if (node.name.endsWith(`.${node.extension}`)) return node.name;
    return `${node.name}.${node.extension}`;
  }
}
