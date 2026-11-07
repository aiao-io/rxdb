import { Dialog } from '@angular/cdk/dialog';
import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  PLATFORM_ID,
  signal,
  TemplateRef,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { LucideAngularModule, X } from 'lucide-angular';
import { fromEvent } from 'rxjs';
import { filter, map, startWith } from 'rxjs/operators';
import { AiChatPanelComponent } from './components/ai/ai-chat-panel.component';
import { CodePreviewComponent } from './components/code-preview/code-preview.component';
import { ModelListComponent } from './components/model-list/model-list.component';
import { SchemaNavigatorComponent } from './components/navigator/schema-navigator.component';
import {
  SqlExecutionDialogComponent,
  type SqlExecutionDialogData
} from './components/sql-execution/sql-execution-dialog.component';
import { DesignerToolbarComponent } from './components/toolbar/designer-toolbar.component';
import { VersionManagerDialogComponent } from './components/version-manager/version-manager-dialog.component';
import { handleKeydown, handleKeyup, type KeyboardContext, type SpaceHoldState } from './designer-keyboard';
import { MODEL_DESIGNER_TRANSLATIONS } from './i18n';
import {
  AI_DRAWER_ADAPTER,
  MODEL_DESIGNER_CONFIG,
  type GeneratedFile,
  type ViewMode
} from './interfaces/designer.interface';
import { AiChatApplyService } from './services/ai-chat-apply.service';
import { AiChatSessionService } from './services/ai-chat-session.service';
import { AiGenerateOrchestratorService } from './services/ai-generate-orchestrator.service';
import { AiOperationGuardService } from './services/ai-operation-guard.service';
import { CodeGeneratorService } from './services/code-generator.service';
import { ConfirmDialogService } from './services/confirm-dialog.service';
import { DesignDiffService } from './services/design-diff.service';
import { DesignEntityService } from './services/design-entity.service';
import { DesignIndexService } from './services/design-index.service';
import { DesignPropertyService } from './services/design-property.service';
import { DesignRelationService } from './services/design-relation.service';
import { DesignerStateService } from './services/designer-state.service';
import { ModelValidatorService } from './services/model-validator.service';
import { SqlExecutionService } from './services/sql-execution.service';

function hasExecutableSql(sql: string): boolean {
  let index = 0;
  let blockCommentDepth = 0;

  while (index < sql.length) {
    const pair = sql.slice(index, index + 2);
    if (pair === '/*') {
      blockCommentDepth += 1;
      index += 2;
      continue;
    }
    if (blockCommentDepth > 0) {
      if (pair === '*/') {
        blockCommentDepth -= 1;
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }
    if (pair === '--') {
      const lineEnd = sql.indexOf('\n', index + 2);
      index = lineEnd === -1 ? sql.length : lineEnd + 1;
      continue;
    }
    if (sql[index]?.trim()) return true;
    index += 1;
  }

  return false;
}

/** Returns an immutable snapshot of the first generated SQL preview containing executable content. */
export function executableSqlPreview(files: readonly GeneratedFile[]): string | null {
  return files.find(file => file.path.endsWith('.sql') && hasExecutableSql(file.content))?.content ?? null;
}

@Component({
  selector: 'lib-model-designer',
  imports: [
    RouterOutlet,
    DesignerToolbarComponent,
    CodePreviewComponent,
    ModelListComponent,
    SchemaNavigatorComponent,
    AiChatPanelComponent,
    LucideAngularModule
  ],
  providers: [
    DesignDiffService,
    DesignEntityService,
    DesignPropertyService,
    DesignRelationService,
    DesignIndexService,
    ModelValidatorService,
    CodeGeneratorService,
    ConfirmDialogService,
    DesignerStateService,
    AiChatApplyService,
    AiChatSessionService,
    AiGenerateOrchestratorService,
    AiOperationGuardService,
    SqlExecutionService
  ],
  templateUrl: './designer.component.html',
  styleUrl: './designer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'full-page' }
})
export default class DesignerComponent {
  readonly #spaceState: SpaceHoldState = { isSpacePressed: false };
  readonly #destroyRef = inject(DestroyRef);
  readonly #router = inject(Router);
  readonly #config = inject(MODEL_DESIGNER_CONFIG, { optional: true });
  readonly #aiDrawer = inject(AI_DRAWER_ADAPTER, { optional: true });
  readonly #routeEntityId = signal<string | null>(null);
  readonly #confirmDialog = inject(ConfirmDialogService);
  readonly #dialog = inject(Dialog);
  readonly #injector = inject(Injector);
  readonly #executionDialogOpen = signal(false);
  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);
  protected readonly state = inject(DesignerStateService);
  protected readonly aiOrchestrator = inject(AiGenerateOrchestratorService);
  protected readonly modelDesign = this.state.modelDesign;
  protected readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly aiChatPanelTpl = viewChild<TemplateRef<unknown>>('aiChatPanelTpl');
  protected readonly executeDisabled = computed(
    () => this.#executionDialogOpen() || executableSqlPreview(this.state.generatedFiles()) === null
  );
  protected readonly X = X;
  protected readonly navigatorOpen = signal(false);

  readonly isDarkMode = computed(() => this.#config?.isDarkMode() ?? false);

  /** 从当前路由 URL 推导 viewMode */
  readonly viewMode = signal<ViewMode>('canvas');

  /** 孤立分支恢复对话框状态 */
  readonly orphanBranchDetected = signal(false);
  readonly orphanBranchId = signal<string | null>(null);

  /** 用户是否显式请求返回模型列表 */
  readonly listRequested = signal(false);

  constructor() {
    const destroyRef = this.#destroyRef;

    // AI 抽屉内容注册
    if (this.#aiDrawer) {
      const drawer = this.#aiDrawer;
      afterNextRender(() => {
        const tpl = this.aiChatPanelTpl();
        if (tpl) drawer.registerContent(tpl);
      });
      destroyRef.onDestroy(() => drawer.clearContent());
    }

    // 监听路由变化，推导 viewMode 和 entityId
    this.#router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        map(e => e.urlAfterRedirects),
        startWith(this.#router.url),
        takeUntilDestroyed(destroyRef)
      )
      .subscribe(url => {
        this.viewMode.set(url.includes('/table/') ? 'table' : 'canvas');
        const match = url.match(/\/(canvas|table)\/([^/?]+)/);
        this.#routeEntityId.set(match?.[2] ?? null);
      });

    // 自动加载第一个设计
    effect(() => {
      if (this.modelDesign.activeDesign()) return;
      const designs = this.modelDesign.designs();
      if (designs.length > 0) {
        this.modelDesign.load(designs[0].id);
      }
    });

    // isDarkMode 变化时重绘主题
    if (this.#config) {
      const darkMode$ = toObservable(this.#config.isDarkMode);
      darkMode$.pipe(takeUntilDestroyed(destroyRef)).subscribe(() => {
        // theme change is handled by child pages via config injection
      });
    }

    // 键盘快捷键
    if (this.isBrowser) {
      const kbCtx: KeyboardContext = {
        interactionMode: () => this.state.interactionMode(),
        setInteractionMode: m => this.state.interactionMode.set(m),
        viewMode: () => this.viewMode(),
        undoCount: () => this.state.undoCount(),
        redoCount: () => this.state.redoCount(),
        selectedEntityIds: () => this.state.selectedEntityIds(),
        onUndo: () => this.state.onUndo(),
        onRedo: () => this.state.onRedo(),
        onEntitiesDeleted: ids => this.state.onEntitiesDeleted(ids)
      };
      fromEvent<KeyboardEvent>(document, 'keydown')
        .pipe(takeUntilDestroyed(destroyRef))
        .subscribe(e => handleKeydown(e, kbCtx, this.#spaceState));
      fromEvent<KeyboardEvent>(document, 'keyup')
        .pipe(takeUntilDestroyed(destroyRef))
        .subscribe(e => handleKeyup(e, kbCtx, this.#spaceState));
    }
  }

  onToggleAi() {
    this.#aiDrawer?.toggle();
  }

  /** 处理孤立分支——继续预览 */
  onRecoverOrphanBranch() {
    this.orphanBranchDetected.set(false);
    this.#aiDrawer?.open();
    this.aiOrchestrator.operationState.set('previewing');
  }

  /** 处理孤立分支——丢弃 */
  onDiscardOrphanBranch() {
    const branchId = this.orphanBranchId();
    if (branchId) {
      this.aiOrchestrator.discard();
    }
    this.orphanBranchDetected.set(false);
    this.orphanBranchId.set(null);
  }

  /** 展示分支 Diff：打开 AI 抽屉 */
  onCompareBranch(branchId: string) {
    void branchId;
    this.#aiDrawer?.open();
  }

  /** Navigator 选中实体 → 导航到对应路由 */
  onEntitySelected(id: string) {
    this.navigatorOpen.set(false);
    this.state.onEntitySelected(id);
    const mode = this.viewMode();
    if (mode === 'canvas') {
      this.#router.navigate(['canvas', id], { relativeTo: this.#activatedChildRoute() });
    } else {
      this.#router.navigate(['table', id, 'properties'], { relativeTo: this.#activatedChildRoute() });
    }
  }

  /** Toolbar viewMode 切换 → 导航到正确路由 */
  onViewModeChange(mode: ViewMode) {
    if (mode === 'canvas') {
      const entityId = this.#routeEntityId();
      const segments = entityId ? ['canvas', entityId] : ['canvas'];
      this.#router.navigate(segments, { relativeTo: this.#activatedChildRoute() });
    } else {
      const entityId = this.#routeEntityId() ?? this.state.entities()[0]?.id;
      if (entityId) {
        this.#router.navigate(['table', entityId, 'properties'], { relativeTo: this.#activatedChildRoute() });
      }
    }
  }

  onSwitchModel(): void {
    this.listRequested.set(true);
  }

  async onModelSelected(id: string) {
    this.modelDesign.load(id);
    this.listRequested.set(false);
  }

  async onModelCreated(name: string) {
    if (await this.state.run('Create model', () => this.state.modelDesign.create(name))) {
      this.listRequested.set(false);
    }
  }

  async onModelCopied(id: string) {
    // 留在列表：复制的用途通常是「基于副本继续改」，用户需要先看到两份再选
    await this.state.run('Copy model', () => this.state.modelDesign.copy(id));
  }

  /** 打开版本管理弹窗，需传入组件级 injector 以携带 {@link ModelDesignService}/DesignDiffService */
  onOpenVersionManager() {
    this.#dialog.open(VersionManagerDialogComponent, {
      ariaLabel: this.t().versionManager.title,
      injector: this.#injector
    });
  }

  /** Opens rollback-only preflight for the current generated SQL snapshot. */
  onExecuteSql(): void {
    const sql = executableSqlPreview(this.state.generatedFiles());
    if (!sql || this.#executionDialogOpen()) return;

    this.#executionDialogOpen.set(true);
    const ref = this.#dialog.open<void, SqlExecutionDialogData>(SqlExecutionDialogComponent, {
      ariaLabel: this.t().sqlExecution.title,
      closeOnNavigation: false,
      data: { sql },
      disableClose: true,
      injector: this.#injector
    });
    ref.closed.pipe(takeUntilDestroyed(this.#destroyRef)).subscribe(() => this.#executionDialogOpen.set(false));
  }

  async onModelDeleted(id: string) {
    const confirmed = await this.#confirmDialog.confirm({
      title: this.t().confirmDialog.deleteModelTitle,
      message: this.t().confirmDialog.deleteModelMessage,
      danger: true
    });
    if (!confirmed) return;
    await this.state.run('Delete model', () => this.state.modelDesign.remove(id));
  }

  #activatedChildRoute() {
    return (
      this.#router.routerState.root.firstChild?.firstChild ??
      this.#router.routerState.root.firstChild ??
      this.#router.routerState.root
    );
  }
}
