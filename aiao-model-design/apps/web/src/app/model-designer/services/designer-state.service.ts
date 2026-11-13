import { RxDB, UUID } from '@aiao/rxdb';
import { computed, inject, Injectable, linkedSignal, signal, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { PropertyType } from '../constants/options';
import { RELATION_KINDS, type RelationKind } from '../constants/relation';
import { formatValidationErrors, generateOrGetErrors } from '../designer-generate';
import { MODEL_DESIGNER_TRANSLATIONS } from '../i18n';
import type {
  DesignEntityChanges,
  DesignIndexChanges,
  DesignPropertyChanges,
  DesignRelationChanges,
  GeneratedFile,
  InteractionMode,
  ModelValidationResult,
  RelationFieldErrors
} from '../interfaces/designer.interface';
import type { DesignProperty } from '../models/index.js';
import { designToSqlSchema, generateCreateSql } from '../sql';
import type { DesignSqlInput } from '../sql/types';
import { collectAffectedRelations, formatDeleteEntityMessage } from '../utils/delete-entity-message';
import { AiOperationGuardService } from './ai-operation-guard.service';
import { CLIENT_PACKAGE_ADAPTER, type ClientPackageRequest } from './client-package-adapter';
import { CodeGeneratorService } from './code-generator.service';
import { ConfirmDialogService } from './confirm-dialog.service';
import { DesignEntityService } from './design-entity.service';
import { DesignIndexService } from './design-index.service';
import { DesignPropertyService } from './design-property.service';
import { DesignRelationService } from './design-relation.service';
import { createValidationSignals } from './designer-validation';
import { ModelDesignService } from './model-design.service';
import { ModelValidatorService } from './model-validator.service';

/**
 * 设计器共享状态服务
 *
 * 管理所有 computed signals、UI 状态和 handler 方法，
 * 供 DesignerComponent（Shell）和路由页面组件共享。
 */
@Injectable()
export class DesignerStateService {
  readonly #t = inject(MODEL_DESIGNER_TRANSLATIONS);
  readonly #confirmDialog = inject(ConfirmDialogService);
  readonly #clientPackageAdapter = inject(CLIENT_PACKAGE_ADAPTER, { optional: true });

  readonly modelValidation: Signal<ModelValidationResult>;
  readonly invalidRelationIds: Signal<Set<string>>;
  readonly invalidPropertyIds: Signal<Set<string>>;
  readonly missingInverseRelationIds: Signal<Set<string>>;
  readonly relationFieldErrors: Signal<RelationFieldErrors>;

  readonly modelDesign = inject(ModelDesignService);
  readonly entityService = inject(DesignEntityService);
  readonly propertyService = inject(DesignPropertyService);
  readonly relationService = inject(DesignRelationService);
  readonly indexService = inject(DesignIndexService);
  readonly codeGenerator = inject(CodeGeneratorService);
  readonly validator = inject(ModelValidatorService);
  readonly aiGuard = inject(AiOperationGuardService);

  readonly history = inject(RxDB).versionManager.history();
  readonly undoCount = toSignal(this.history.undoCount$, { initialValue: 0 });
  readonly redoCount = toSignal(this.history.redoCount$, { initialValue: 0 });

  // UI state signals
  readonly interactionMode = signal<InteractionMode>('move');
  readonly viewport = signal<{ zoom: number; panX: number; panY: number } | undefined>(undefined);
  readonly codePreviewOpen = signal(false);
  readonly generatedFiles = signal<GeneratedFile[]>([]);
  readonly generatedErrors = signal<string[]>([]);
  readonly lastError = signal<string | null>(null);

  /**
   * 任一活查询失败时的消息（[缺陷台账 #21](../../../../requirements/known-defects.md)）。
   *
   * `useFindAll` 的错误回调是 `error: setFailure`——按 RxJS 语义**订阅就此终止**。
   * 于是列表永远停在最后一帧：数据在库里、界面停在旧数量、只有刷新能恢复。
   * 这个 signal 存在之前，本仓 13 处 `useFindAll` 调用点**无一读过 `error`**，
   * 所以这一切是完全静默的。
   */
  readonly queryError = computed(
    () =>
      this.modelDesign.queryError() ??
      this.entityService.queryError() ??
      this.propertyService.queryError() ??
      this.relationService.queryError() ??
      this.indexService.queryError()
  );

  /**
   * 错误横幅要显示的内容。
   *
   * **活查询失败优先**：它是「后续每一次操作看起来都失灵」的根因，
   * 而单次操作失败只影响那一次。
   */
  readonly bannerError = computed(() => this.queryError() ?? this.lastError());

  /**
   * 横幅是否可关闭。
   *
   * 活查询失败**不可关闭**——订阅已经终止，关掉横幅只会把一个永久故障藏起来，
   * 而用户看到的仍是一个不再更新的列表。这正是 #21 之所以难查的原因。
   */
  readonly bannerDismissible = computed(() => this.queryError() === null);

  // Computed signals
  readonly activeDesignName = computed(() => this.modelDesign.activeDesign()?.name ?? '');
  readonly clientPackageName = linkedSignal(() => this.#defaultClientPackageName(this.activeDesignName()));
  readonly clientPackageVersion = signal<string | null>(null);
  readonly clientPackageBusy = signal(false);
  readonly canArchiveClientPackage = computed(
    () =>
      Boolean(this.#clientPackageAdapter) &&
      !this.clientPackageBusy() &&
      this.generatedFiles().some(file => file.path.endsWith('.js')) &&
      this.generatedFiles().some(file => file.path.endsWith('.d.ts'))
  );
  readonly canPublishClientPackage = this.canArchiveClientPackage;
  readonly entities = computed(() => this.entityService.entities());
  readonly entityPairs = computed(() => this.entities().map(e => ({ id: e.id, name: e.name })));
  readonly selectedEntityIds = computed(() => this.entityService.selectedEntityIds());
  readonly selectedEntities = computed(() => {
    const ids = this.selectedEntityIds();
    return this.entities().filter(e => ids.has(e.id));
  });
  readonly selectedEntity = computed(() => {
    const sel = this.selectedEntities();
    return sel.length === 1 ? sel[0] : null;
  });
  readonly selectedEntityId = computed(() => this.selectedEntity()?.id ?? null);
  readonly allRelations = computed(() => this.relationService.allRelations());
  readonly propertiesMap = computed(() => this.#buildEntityMap(id => this.propertyService.propertiesOf(id)()));
  readonly childPropertiesMap = computed(() => {
    const map = new Map<string, DesignProperty[]>();
    for (const entity of this.entities()) {
      for (const prop of this.propertyService.propertiesOf(entity.id)()) {
        if (prop.propertyType === 'keyValue') {
          map.set(prop.id, this.propertyService.childPropertiesOf(prop.id)());
        }
      }
    }
    return map;
  });
  readonly relationsMap = computed(() => this.#buildEntityMap(id => this.relationService.relationsOf(id)()));
  readonly indexesMap = computed(() => this.#buildEntityMap(id => this.indexService.indexesOf(id)()));

  readonly selectedEntityProperties = computed(() =>
    this.#selectedEntityItems(id => this.propertyService.propertiesOf(id)())
  );

  readonly selectedEntityRelations = computed(() =>
    this.#selectedEntityItems(id => this.relationService.relationsOf(id)())
  );

  readonly selectedEntityIndexes = computed(() => this.#selectedEntityItems(id => this.indexService.indexesOf(id)()));

  constructor() {
    const v = createValidationSignals(
      this.validator,
      this.entities,
      this.propertiesMap,
      this.relationsMap,
      this.childPropertiesMap
    );
    this.modelValidation = v.modelValidation;
    this.invalidRelationIds = v.invalidRelationIds;
    this.invalidPropertyIds = v.invalidPropertyIds;
    this.missingInverseRelationIds = v.missingInverseRelationIds;
    this.relationFieldErrors = v.relationFieldErrors;
  }

  // Handler methods

  /**
   * 跑一次可能失败的设计器操作，失败原因写进 {@link lastError} 供错误横幅显示。
   *
   * 进入时先清空：横幅不区分「这次失败」和「上次失败还没关」，
   * 不清就会把旧错误挂在成功的操作上。
   *
   * @param label 失败文案前缀，如 `Create entity`
   * @param op 待执行的操作
   * @returns 是否成功
   */
  async run(label: string, op: () => Promise<unknown>): Promise<boolean> {
    this.lastError.set(null);
    try {
      await op();
      return true;
    } catch (e) {
      this.lastError.set(`${label} failed: ${(e as Error).message}`);
      return false;
    }
  }

  async onAddEntity() {
    await this.run('Create entity', () => this.entityService.create());
  }

  onEntitySelected(id: string): boolean {
    const entity = this.entities().find(e => e.id === id);
    if (!entity) {
      this.entityService.clearSelection();
      return false;
    }
    this.entityService.selectOne(id);
    return true;
  }

  onEntitySelectionToggled(id: string) {
    this.entityService.toggleSelect(id);
  }

  onEntitySelectionChanged(ids: string[]) {
    this.entityService.selectMany(ids);
  }

  onSelectionCleared() {
    this.entityService.clearSelection();
  }

  async onDeleteSelectedEntities() {
    await this.onEntitiesDeleted([...this.selectedEntityIds()]);
  }
  async onEntityMoved(ev: { id: string; x: number; y: number }) {
    await this.entityService.updatePosition(ev.id, ev.x, ev.y);
  }
  async onEntitiesMovedBatch(items: { id: string; x: number; y: number }[]) {
    await this.entityService.updatePositionsBatch(items);
  }
  async onEntityResized(ev: { id: string; width: number }) {
    await this.entityService.updateWidth(ev.id, ev.width);
  }

  async onEntityUpdated(changes: DesignEntityChanges) {
    const sel = this.selectedEntity();
    if (!sel) return;
    await this.run('Update entity', () => this.entityService.update(sel.id, changes));
  }

  async onTableEntityUpdated(ev: { id: string; changes: DesignEntityChanges }) {
    await this.run('Update entity', () => this.entityService.update(ev.id, ev.changes));
  }

  async onEntitiesDeleted(ids: string[]): Promise<boolean> {
    if (ids.length === 0) return false;
    const affected = collectAffectedRelations(ids, this.relationService.allRelations(), entityId =>
      this.relationService.findByTargetEntity(entityId)
    );
    const cd = this.#t().confirmDialog;
    const message = formatDeleteEntityMessage(ids.length, affected, {
      baseMessage: cd.deleteEntityMessage,
      affectedPrefix: cd.deleteEntityAffectedPrefix,
      overflowSuffix: cd.deleteEntityAffectedOverflow
    });
    const confirmed = await this.#confirmDialog.confirm({
      title: cd.deleteEntityTitle,
      message,
      danger: true
    });
    if (!confirmed) return false;
    return this.run('Delete entity', () => this.entityService.removeMany(ids));
  }

  async onEntityDeleted(id: string): Promise<boolean> {
    return this.onEntitiesDeleted([id]);
  }

  async onPropertyAdded(ev: { entityId?: string; name: string; type: string }) {
    const targetId = ev.entityId ?? this.selectedEntity()?.id;
    if (targetId) await this.propertyService.create(targetId, ev.name, ev.type as PropertyType);
  }

  async onPropertyUpdated(ev: { id: string; changes: DesignPropertyChanges }) {
    if (ev.changes.propertyType !== undefined) {
      const cd = this.#t().confirmDialog;
      const confirmed = await this.#confirmDialog.confirm({
        title: cd.sqlImpactTitle,
        message: cd.sqlImpactMessage,
        confirmText: cd.sqlImpactConfirmButton,
        danger: false
      });
      if (!confirmed) return;
    }
    await this.propertyService.update(ev.id, ev.changes);
  }
  async onPropertiesBatchUpdated(items: { id: string; changes: DesignPropertyChanges }[]) {
    await this.propertyService.updateBatch(items);
  }
  async onPropertyDeleted(id: string) {
    const confirmed = await this.#confirmDialog.confirm({
      title: this.#t().confirmDialog.deletePropertyTitle,
      message: this.#t().confirmDialog.deletePropertyMessage,
      danger: true
    });
    if (!confirmed) return;
    await this.propertyService.remove(id);
  }

  async onChildPropertyAdded(ev: { entityId?: string; parentPropertyId: string; name: string; type: string }) {
    const entityId = ev.entityId ?? this.selectedEntity()?.id;
    if (entityId) await this.propertyService.create(entityId, ev.name, ev.type as PropertyType, ev.parentPropertyId);
  }

  async onChildPropertyUpdated(ev: { id: string; changes: DesignPropertyChanges }) {
    await this.propertyService.update(ev.id, ev.changes);
  }
  async onChildPropertyDeleted(id: string) {
    await this.onPropertyDeleted(id);
  }

  async onRelationCreated(ev: { sourceEntityId: string; targetEntityId: string }) {
    await this.run('Create relation', () =>
      this.relationService.createLinkedPair(
        ev.sourceEntityId as UUID,
        ev.targetEntityId as UUID,
        RELATION_KINDS.MANY_TO_ONE
      )
    );
  }

  async onRelationAdded(ev: { entityId?: string; name: string; kind: string; targetEntity: string }) {
    const entityId = (ev.entityId ?? this.selectedEntity()?.id) as UUID | undefined;
    if (!entityId) return;
    const target = ev.targetEntity ? this.entities().find(e => e.name === ev.targetEntity) : undefined;
    const rel = await this.relationService.create(entityId, target?.id ?? null, ev.kind as RelationKind);
    if (ev.name !== rel.name) await this.relationService.update(rel.id, { name: ev.name });
  }

  async onRelationUpdated(ev: { id: string; changes: DesignRelationChanges }) {
    await this.relationService.update(ev.id, ev.changes);
  }
  async onRelationsBatchUpdated(items: { id: string; changes: DesignRelationChanges }[]) {
    await this.relationService.updateBatch(items);
  }
  async onRelationDeleted(id: string) {
    const confirmed = await this.#confirmDialog.confirm({
      title: this.#t().confirmDialog.deleteRelationTitle,
      message: this.#t().confirmDialog.deleteRelationMessage,
      danger: true
    });
    if (!confirmed) return;
    await this.relationService.remove(id);
  }

  async onIndexAdded(ev: { entityId?: string; propertyIds: string[]; isUnique: boolean }) {
    const entityId = ev.entityId ?? this.selectedEntity()?.id;
    if (entityId) await this.indexService.create(entityId, ev.propertyIds, ev.isUnique);
  }

  async onIndexUpdated(ev: { id: string; changes: DesignIndexChanges }) {
    await this.indexService.update(ev.id, ev.changes);
  }
  async onIndexesBatchUpdated(items: { id: string; changes: DesignIndexChanges }[]) {
    await this.indexService.updateBatch(items);
  }
  async onIndexDeleted(id: string) {
    const confirmed = await this.#confirmDialog.confirm({
      title: this.#t().confirmDialog.deleteIndexTitle,
      message: this.#t().confirmDialog.deleteIndexMessage,
      danger: true
    });
    if (!confirmed) return;
    await this.indexService.remove(id);
  }
  async onIndexesDeleteBatch(ids: string[]) {
    await Promise.all(ids.map(id => this.indexService.remove(id)));
  }

  onGenerate() {
    const metadataOptions = this.codeGenerator.toAllMetadataOptions(
      this.entities(),
      this.propertiesMap(),
      this.relationsMap(),
      this.indexesMap(),
      this.childPropertiesMap()
    );
    const result = generateOrGetErrors(
      this.modelValidation(),
      this.codeGenerator,
      this.entities(),
      this.allRelations(),
      this.#t() as unknown as Record<string, unknown>,
      metadataOptions
    );
    this.generatedFiles.set(result.files);
    this.generatedErrors.set(result.errors);
    this.codePreviewOpen.set(true);
  }

  onGenerateSql() {
    if (!this.#canGenerateSql()) return;
    const input = this.#toDesignSqlInput();
    const schema = designToSqlSchema(input);
    const result = generateCreateSql(schema);
    const base = this.activeDesignName() || 'model';
    this.generatedFiles.set([{ path: `${base}.sql`, content: result.sql }]);
    this.generatedErrors.set([]);
    this.codePreviewOpen.set(true);
  }

  onDownloadZip() {
    const files = this.generatedFiles();
    if (files.length > 0) this.codeGenerator.downloadZip(files, this.activeDesignName() || 'model');
  }

  /** 将当前生成结果打包为可安装的 npm tgz 并下载。 */
  async onArchiveClientPackage(): Promise<void> {
    const adapter = this.#clientPackageAdapter;
    if (!adapter) {
      this.lastError.set(this.#t().codePreview.packageUnavailable);
      return;
    }

    this.clientPackageBusy.set(true);
    this.lastError.set(null);
    try {
      const design = this.modelDesign.activeDesign();
      const archive = await adapter.archive(this.#clientPackageRequest(design));
      this.clientPackageVersion.set(archive.version);
      this.codeGenerator.downloadBlob(archive.blob, archive.filename);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastError.set(`${this.#t().codePreview.archiveFailed}: ${message}`);
    } finally {
      this.clientPackageBusy.set(false);
    }
  }

  /** 将当前生成结果发布到服务端配置的私有 npm registry。 */
  async onPublishClientPackage(): Promise<void> {
    const adapter = this.#clientPackageAdapter;
    if (!adapter) {
      this.lastError.set(this.#t().codePreview.packageUnavailable);
      return;
    }

    this.clientPackageBusy.set(true);
    this.lastError.set(null);
    try {
      const publication = await adapter.publish(this.#clientPackageRequest(this.modelDesign.activeDesign()));
      this.clientPackageVersion.set(publication.version);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastError.set(`${this.#t().codePreview.publishFailed}: ${message}`);
    } finally {
      this.clientPackageBusy.set(false);
    }
  }

  onUndo() {
    this.history.undo();
  }

  onRedo() {
    this.history.redo();
  }

  onViewportChanged(vp: { zoom: number; panX: number; panY: number }) {
    this.viewport.set(vp);
  }

  toggleInteractionMode(mode: InteractionMode) {
    this.interactionMode.set(mode);
    if (mode === 'move') {
      this.entityService.clearSelection();
    }
  }

  /**
   * SQL 生成专用 guard：只校验实体标识（名称、表名、唯一性），
   * 不强制要求至少一个用户属性——即使无属性也有基础列（id/created_at/updated_at/created_by/updated_by）。
   */
  #canGenerateSql(): boolean {
    const entities = this.entities();
    const entityErrors = new Map<string, string[]>();

    for (const entity of entities) {
      const siblings = entities.filter(e => e.id !== entity.id);
      const idValidation = this.validator.validateEntityIdentity(entity, siblings);
      if (!idValidation.valid) {
        entityErrors.set(entity.id, idValidation.errors);
      }
    }

    if (entityErrors.size > 0) {
      const validation: ModelValidationResult = {
        valid: false,
        entityErrors,
        propertyErrors: new Map(),
        relationErrors: new Map(),
        globalErrors: []
      };
      this.generatedFiles.set([]);
      this.generatedErrors.set(
        formatValidationErrors(validation, entities, [], this.#t() as unknown as Record<string, unknown>)
      );
      this.codePreviewOpen.set(true);
      return false;
    }

    return true;
  }

  #toDesignSqlInput(): DesignSqlInput {
    const entities = this.entities();
    const properties = entities.flatMap(e => this.propertyService.propertiesOf(e.id)());
    const relations = this.allRelations();
    const indexes = entities.flatMap(e => this.indexService.indexesOf(e.id)());
    const propertyEntityIds: Record<string, string> = {};
    for (const entity of entities) {
      for (const prop of this.propertyService.propertiesOf(entity.id)()) {
        propertyEntityIds[prop.id] = entity.id;
      }
    }
    return {
      entities: entities.map(e => ({
        id: e.id,
        name: e.name,
        tableName: e.tableName,
        extendsBase: e.extendsBase
      })),
      properties: properties.map(p => ({
        id: p.id,
        name: p.name,
        propertyType: p.propertyType,
        columnName: p.columnName,
        isNullable: p.isNullable,
        isUnique: p.isUnique,
        isRequired: p.isRequired,
        defaultValue: p.defaultValue,
        enumValues: p.enumValues,
        sortOrder: p.sortOrder
      })),
      relations: relations.map(r => ({
        id: r.id,
        name: r.name,
        relationKind: r.relationKind,
        mappedEntityId: r.mappedEntityId,
        columnName: r.columnName,
        onDeleteAction: r.onDeleteAction,
        onUpdateAction: r.onUpdateAction,
        designEntityId: r.designEntityId
      })),
      indexes: indexes.map(i => ({
        id: i.id,
        propertyIds: i.propertyIds ?? [],
        isUnique: i.isUnique,
        displayName: i.displayName,
        designEntityId: i.designEntityId
      })),
      propertyEntityIds
    };
  }

  #buildEntityMap<T>(selector: (entityId: string) => T[]): Map<string, T[]> {
    const result = new Map<string, T[]>();
    for (const entity of this.entities()) {
      result.set(entity.id, selector(entity.id));
    }
    return result;
  }

  #selectedEntityItems<T>(selector: (entityId: string) => T[]): T[] {
    const sel = this.selectedEntity();
    return sel ? selector(sel.id) : [];
  }

  #defaultClientPackageName(designName: string): string {
    const project = designName
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
    return `@aiao/${project || 'model'}-rxdb`;
  }

  #clientPackageRequest(design: { name: string; description?: string | null } | null): ClientPackageRequest {
    return {
      packageName: this.clientPackageName(),
      generatedFiles: this.generatedFiles(),
      designContract: this.codeGenerator.toClientDesignContract(
        this.entities(),
        this.propertiesMap(),
        this.relationsMap(),
        {
          designName: design?.name ?? 'Model',
          ...(design?.description ? { description: design.description } : {})
        }
      )
    };
  }
}
