import { InjectionToken, Signal, signal } from '@angular/core';

export interface ModelDesignerTranslations {
  toolbar: {
    untitled: string;
    /** 模型名按钮的说明：点它返回模型列表（切换/复制/删除/新建的入口） */
    switchModel: string;
    canvas: string;
    table: string;
    addEntity: string;
    undo: string;
    redo: string;
    generate: string;
    generateSql: string;
    compareSql: string;
    executeSql: string;
    ariaViewMode: string;
    openNavigator: string;
    closeNavigator: string;
    moreActions: string;
    singleSelectMode: string;
    rubberSelectMode: string;
    versionManager: string;
    hostCapabilityUnavailable: string;
  };
  entityPanel: {
    deleteEntity: string;
    name: string;
    tableName: string;
    displayName: string;
    extends: string;
    namespace: string;
    properties: string;
    relations: string;
    indexes: string;
    nullable: string;
    required: string;
    unique: string;
    readonly: string;
    sortable: string;
    columnName: string;
    propertyDisplayName: string;
    defaultValue: string;
    addProperty: string;
    addChildProperty: string;
    enumValues: string;
    enumValuesPlaceholder: string;
    ariaClose: string;
    ariaDeleteProperty: string;
    tableNamePlaceholder: string;
    inheritedFrom: string;
    readonlyBadge: string;
    expandAllGroups: string;
    collapseAllGroups: string;
    dragToReorder: string;
    entityMeta: string;
    emptyProperties: string;
    emptyRelations: string;
    emptyIndexes: string;
    keyValueProperties: string;
    expandDetails: string;
    collapseDetails: string;
    addIndexDisabled: string;
    closeTypeSelect: string;
  };
  relationPanel: {
    kind: string;
    targetEntity: string;
    mappedProperty: string;
    columnName: string;
    displayName: string;
    onDelete: string;
    onUpdate: string;
    addRelation: string;
    ariaDeleteRelation: string;
    ariaRelationName: string;
    columnNamePlaceholder: string;
    inheritedFrom: string;
  };
  indexPanel: {
    noProperties: string;
    unique: string;
    properties: string;
    displayName: string;
    uniqueCheckbox: string;
    addIndex: string;
    ariaDeleteIndex: string;
    searchProperties: string;
    noMatch: string;
  };
  codePreview: {
    title: string;
    errors: string;
    downloadZip: string;
    packageName: string;
    packageNamePlaceholder: string;
    archivePackage: string;
    archiving: string;
    publishPackage: string;
    publishing: string;
    packageVersion: string;
    archiveFailed: string;
    publishFailed: string;
    packageUnavailable: string;
    ariaClose: string;
  };
  /** 设计器操作失败横幅（建/删实体、建关系、建/复制/删模型的统一出口） */
  errorBanner: {
    ariaDismiss: string;
  };
  sql: {
    remoteUnavailable: string;
    remoteFetchFailed: string;
    remoteStale: string;
    noDifferences: string;
  };
  sqlExecution: {
    title: string;
    preflighting: string;
    rollbackOnly: string;
    ready: string;
    safeConfirmation: string;
    statementCount: string;
    affectedTables: string;
    noAffectedTables: string;
    execute: string;
    executing: string;
    preflightFailed: string;
    executionFailed: string;
    outcomeUnknown: string;
    compareBeforeContinuing: string;
    sqlRetained: string;
    retry: string;
    cancel: string;
    close: string;
    successTitle: string;
    successMessage: string;
    destructiveTitle: string;
    destructiveWarning: string;
    backupWarning: string;
    confirmDestructive: string;
    retryDestructive: string;
  };
  modelList: {
    title: string;
    noModels: string;
    newModelPlaceholder: string;
    create: string;
    ariaDeleteModel: string;
    copyModel: string;
    ariaCopyModel: string;
  };
  tableView: {
    newTab: string;
    colName: string;
    colType: string;
    colNullable: string;
    colRequired: string;
    colUnique: string;
    colReadonly: string;
    colSortable: string;
    colDefault: string;
    colEnumValues: string;
    colColumnName: string;
    colDisplayName: string;
    colNotSupported: string;
    addProperty: string;
    addChildProperty: string;
    emptyMessage: string;
    ariaDeleteProperty: string;
    colActions: string;
    colDeleteAction: string;
  };
  validation: {
    entityNameHint: string;
    tableNameHint: string;
    propertyNameHint: string;
    columnNameHint: string;
    entityNameRequired: string;
    entityNameMustBePascalCase: string;
    entityNameAlreadyExists: string;
    tableNameInvalid: string;
    tableNameAlreadyExists: string;
    propertyNameRequired: string;
    propertyNameMustBeCamelCase: string;
    propertyNameReservedWord: string;
    propertyNameAlreadyExists: string;
    childPropertyNameAlreadyExists: string;
    childPropertyNameDuplicate: string;
    childPropertyInvalid: string;
    entityMustHaveAtLeastOneProperty: string;
    relationMustSpecifyMappedEntityId: string;
    targetEntityDoesNotExist: string;
    relationMustSpecifyMappedPropertyId: string;
    relationNameDuplicated: string;
    missingInverseRelation: string;
    relationNameHint: string;
    relationTargetEntityHint: string;
    relationMappedPropertyHint: string;
    missingInverseRelationHint: string;
    indexDuplicatePropertyCombination: string;
    indexEmptyPropertyCombination: string;
  };
  navigator: {
    empty: string;
    entityCount: string;
  };
  selectionSummary: {
    selectedCount: string;
    deleteSelected: string;
    clearSelection: string;
  };
  confirmDialog: {
    cancelButton: string;
    confirmButton: string;
    deleteEntityTitle: string;
    deleteEntityMessage: string;
    deleteEntityAffectedPrefix: string;
    deleteEntityAffectedOverflow: string;
    deleteRelationTitle: string;
    deleteRelationMessage: string;
    deletePropertyTitle: string;
    deletePropertyMessage: string;
    deleteIndexTitle: string;
    deleteIndexMessage: string;
    deleteModelTitle: string;
    deleteModelMessage: string;
    rollbackTitle: string;
    rollbackMessage: string;
    sqlImpactTitle: string;
    sqlImpactMessage: string;
    sqlImpactConfirmButton: string;
  };
  versionManager: {
    title: string;
    targetLabel: string;
    snapshotLabel: string;
    selectPlaceholder: string;
    addedEntities: string;
    removedEntities: string;
    commonEntities: string;
    fieldChanges: string;
    fieldAdded: string;
    fieldRemoved: string;
    fieldChanged: string;
    noFieldChange: string;
    noDiff: string;
    rollbackButton: string;
    closeButton: string;
  };
  ai: {
    send: string;
    inputPlaceholder: string;
    generating: string;
    previewing: string;
    interrupted: string;
    offline: string;
    pendingChanges: string;
    confirmMerge: string;
    continueEditing: string;
    discard: string;
    onAiBranch: string;
    noSupport: string;
    retry: string;
    validate: string;
    validating: string;
    adopt: string;
    ignore: string;
    adopted: string;
    ignored: string;
    tooManyEntities: string;
    applyChanges: string;
    cancelChanges: string;
    added: string;
    modified: string;
    removed: string;
    deleted: string;
    noChanges: string;
    chatPlaceholder: string;
    newSession: string;
    deleteSession: string;
    sessionList: string;
    backToSessions: string;
    noSessions: string;
    retainedEntities: string;
    continueGenerating: string;
    acceptPartial: string;
    stopGenerating: string;
    stopping: string;
    chars: string;
    diffDetails: string;
  };
  /** 属性类型本地化标签 */
  propertyTypes: Record<string, string>;
}

export const DEFAULT_TRANSLATIONS: ModelDesignerTranslations = {
  toolbar: {
    untitled: 'Untitled',
    switchModel: 'Switch model (back to list)',
    canvas: 'Canvas',
    table: 'Table',
    addEntity: '+ Entity',
    undo: 'Undo',
    redo: 'Redo',
    generate: 'Generate',
    generateSql: 'Generate SQL',
    compareSql: 'Compare SQL',
    executeSql: 'Execute SQL',
    ariaViewMode: 'View mode',
    openNavigator: 'Open entity navigator',
    closeNavigator: 'Close entity navigator',
    moreActions: 'More actions',
    singleSelectMode: 'Single Select',
    rubberSelectMode: 'Rubber Band Select',
    versionManager: 'Version Manager',
    hostCapabilityUnavailable: 'This action requires a host application capability'
  },
  entityPanel: {
    deleteEntity: 'Delete',
    name: 'Name',
    tableName: 'Table Name',
    displayName: 'Display Name',
    extends: 'Extends',
    namespace: 'Namespace',
    properties: 'Properties',
    relations: 'Relations',
    indexes: 'Indexes',
    nullable: 'nullable',
    required: 'required',
    unique: 'unique',
    readonly: 'readonly',
    sortable: 'sortable',
    columnName: 'column',
    propertyDisplayName: 'Display Name',
    defaultValue: 'Default Value',
    addProperty: '+ Add Property',
    addChildProperty: '+ Add Sub-property',
    enumValues: 'Enum Values',
    enumValuesPlaceholder: 'Comma-separated values, e.g. active,inactive,pending',
    ariaClose: 'Close panel',
    ariaDeleteProperty: 'Delete property',
    tableNamePlaceholder: 'Same as name if empty',
    inheritedFrom: 'Inherited from {source}',
    readonlyBadge: 'Read-only',
    expandAllGroups: 'Expand all',
    collapseAllGroups: 'Collapse all',
    dragToReorder: 'Drag to reorder',
    entityMeta: 'Entity details',
    emptyProperties: 'No custom properties yet',
    emptyRelations: 'No custom relations yet',
    emptyIndexes: 'No indexes yet',
    keyValueProperties: 'KeyValue fields',
    expandDetails: 'Show details',
    collapseDetails: 'Hide details',
    addIndexDisabled: 'Add a property before creating an index',
    closeTypeSelect: 'Close type menu'
  },
  relationPanel: {
    kind: 'Kind',
    targetEntity: 'Target Entity',
    mappedProperty: 'Mapped Property',
    columnName: 'Column Name',
    displayName: 'Display Name',
    onDelete: 'On Delete',
    onUpdate: 'On Update',
    addRelation: '+ Add Relation',
    ariaDeleteRelation: 'Delete relation',
    ariaRelationName: 'Relation name',
    columnNamePlaceholder: 'Auto-generated if empty',
    inheritedFrom: 'Inherited from {source}'
  },
  indexPanel: {
    noProperties: '(no properties)',
    unique: 'unique',
    properties: 'Properties',
    displayName: 'Display Name',
    uniqueCheckbox: 'Unique',
    addIndex: '+ Add Index',
    ariaDeleteIndex: 'Delete index',
    searchProperties: 'Search properties…',
    noMatch: 'No matching properties'
  },
  codePreview: {
    title: 'Code Preview',
    errors: 'errors',
    downloadZip: 'Download ZIP',
    packageName: 'Package',
    packageNamePlaceholder: '@scope/project-rxdb',
    archivePackage: 'Download package',
    archiving: 'Building package...',
    publishPackage: 'Publish package',
    publishing: 'Publishing package...',
    packageVersion: 'Version',
    archiveFailed: 'Package archive failed',
    publishFailed: 'Package publish failed',
    packageUnavailable: 'Client package service is unavailable',
    ariaClose: 'Close preview'
  },
  errorBanner: {
    ariaDismiss: 'Dismiss error'
  },
  sql: {
    remoteUnavailable: 'No remote schema source configured — unable to generate a diff.',
    remoteFetchFailed: 'Failed to read the remote schema',
    remoteStale: 'Failed to read the remote schema; using the last cached snapshot',
    noDifferences: 'no differences'
  },
  sqlExecution: {
    title: 'Execute SQL',
    preflighting: 'Checking SQL impact...',
    rollbackOnly: 'This check runs in a transaction and will not change the remote schema.',
    ready: 'Preflight passed',
    safeConfirmation: 'Review the impact before committing this SQL snapshot.',
    statementCount: 'Statements',
    affectedTables: 'Affected tables',
    noAffectedTables: 'No affected tables reported',
    execute: 'Execute',
    executing: 'Executing SQL...',
    preflightFailed: 'Preflight failed',
    executionFailed: 'Execution failed',
    outcomeUnknown: 'Execution outcome unknown',
    compareBeforeContinuing: 'Compare the remote schema before continuing. Do not execute this SQL again yet.',
    sqlRetained: 'The SQL snapshot is retained and can be retried.',
    retry: 'Retry',
    cancel: 'Cancel',
    close: 'Close',
    successTitle: 'SQL committed',
    successMessage: '{count} tables affected. Use Compare SQL to verify the remote schema.',
    destructiveTitle: 'Destructive changes detected',
    destructiveWarning: 'This SQL removes remote schema objects and cannot be undone automatically.',
    backupWarning: 'Create and verify a database backup before continuing.',
    confirmDestructive: 'Confirm destructive execution',
    retryDestructive: 'Retry destructive execution'
  },
  modelList: {
    title: 'Model Designs',
    noModels: 'No models yet',
    newModelPlaceholder: 'New model name',
    create: 'Create',
    ariaDeleteModel: 'Delete model',
    copyModel: 'Copy',
    ariaCopyModel: 'Copy model'
  },
  tableView: {
    newTab: '+ New',
    colName: 'Name',
    colType: 'Type',
    colNullable: 'Nullable',
    colRequired: 'Required',
    colUnique: 'Unique',
    colReadonly: 'Readonly',
    colSortable: 'Sortable',
    colDefault: 'Default',
    colEnumValues: 'Enum Values',
    colColumnName: 'Column Name',
    colDisplayName: 'Display Name',
    colNotSupported: 'N/A',
    addProperty: '+ Add Property',
    addChildProperty: '+ Sub',
    emptyMessage: 'Select or create an entity to edit properties',
    ariaDeleteProperty: 'Delete property',
    colActions: 'Operations',
    colDeleteAction: 'Delete'
  },
  validation: {
    entityNameHint: 'Must start with uppercase letter, only letters, digits and underscores',
    tableNameHint: 'Must start with a letter, only letters, digits and underscores',
    propertyNameHint: 'Must start with lowercase letter, only letters, digits and underscores',
    columnNameHint: 'Must start with lowercase letter, only letters, digits and underscores',
    entityNameRequired: 'Entity name is required',
    entityNameMustBePascalCase: 'Entity name must be PascalCase',
    entityNameAlreadyExists: 'Entity name "{name}" already exists',
    tableNameInvalid: 'Table name is invalid',
    tableNameAlreadyExists: 'Resolved SQL table name already exists',
    propertyNameRequired: 'Property name is required',
    propertyNameMustBeCamelCase: 'Property name must be camelCase',
    propertyNameReservedWord: 'Property name "{name}" is a reserved word',
    propertyNameAlreadyExists: 'Property name "{name}" already exists',
    childPropertyNameAlreadyExists: 'Child property name "{name}" already exists',
    childPropertyNameDuplicate: 'Sub-property name is duplicated',
    childPropertyInvalid: 'Child property has validation error',
    entityMustHaveAtLeastOneProperty: 'Entity must have at least one property',
    relationMustSpecifyMappedEntityId: 'Relation must specify mappedEntityId',
    targetEntityDoesNotExist: 'Target entity with ID "{id}" does not exist',
    relationMustSpecifyMappedPropertyId: 'Relation must specify mappedPropertyId',
    relationNameDuplicated: 'Relation name "{name}" is duplicated',
    missingInverseRelation: 'Missing inverse {kind} relation on "{target}"',
    relationNameHint: 'Must start with lowercase letter, only letters, digits and underscores',
    relationTargetEntityHint: 'Target entity must be selected',
    relationMappedPropertyHint: 'Mapped property must be selected',
    missingInverseRelationHint: 'Missing inverse relation on target entity',
    indexDuplicatePropertyCombination: 'Duplicate index: same property combination already exists',
    indexEmptyPropertyCombination: 'Index must have at least one property'
  },
  navigator: {
    empty: 'No entities yet. Click + to add one.',
    entityCount: '{count} entities'
  },
  selectionSummary: {
    selectedCount: '{count} entities selected',
    deleteSelected: 'Delete Selected',
    clearSelection: 'Clear Selection'
  },
  confirmDialog: {
    cancelButton: 'Cancel',
    confirmButton: 'Delete',
    deleteEntityTitle: 'Delete Entity',
    deleteEntityMessage: 'Delete {count} entities? This action cannot be undone.',
    deleteEntityAffectedPrefix: 'Affected relations: {list}',
    deleteEntityAffectedOverflow: ' (+{count} more)',
    deleteRelationTitle: 'Delete Relation',
    deleteRelationMessage: 'Delete this relation? This action cannot be undone.',
    deletePropertyTitle: 'Delete Property',
    deletePropertyMessage: 'Delete this property? This action cannot be undone.',
    deleteIndexTitle: 'Delete Index',
    deleteIndexMessage: 'Delete this index? This action cannot be undone.',
    deleteModelTitle: 'Delete Model Design',
    deleteModelMessage: 'Delete this model design and all its entities? This action cannot be undone.',
    rollbackTitle: 'Rollback Model Design',
    rollbackMessage: 'Roll back this model design to the selected version? Current changes cannot be recovered.',
    sqlImpactTitle: 'SQL impact check',
    sqlImpactMessage:
      'Changing the property type may affect generated SQL and existing data. Continue? (Detailed impact analysis will be provided by SQL sync.)',
    sqlImpactConfirmButton: 'Continue'
  },
  versionManager: {
    title: 'Version Manager',
    targetLabel: 'Target (will be overwritten)',
    snapshotLabel: 'Snapshot (rollback source)',
    selectPlaceholder: 'Select a model design...',
    addedEntities: 'Added',
    removedEntities: 'Removed',
    commonEntities: 'Common entities',
    fieldChanges: 'Field changes',
    fieldAdded: 'Added fields',
    fieldRemoved: 'Removed fields',
    fieldChanged: 'Changed fields',
    noFieldChange: 'No field differences',
    noDiff: 'Select two different model designs to compare.',
    rollbackButton: 'Rollback',
    closeButton: 'Close'
  },
  ai: {
    send: 'Send',
    inputPlaceholder: 'Describe your data model...',
    generating: 'Generating...',
    previewing: 'Preview',
    interrupted: 'Interrupted',
    offline: 'AI features require network connection',
    pendingChanges: 'Please handle current changes first',
    confirmMerge: 'Confirm Merge',
    continueEditing: 'Continue Editing',
    discard: 'Discard',
    onAiBranch: 'On AI branch',
    noSupport: 'AI features not supported on this page',
    retry: 'Retry',
    validate: 'Validate',
    validating: 'Validating...',
    adopt: 'Adopt',
    ignore: 'Ignore',
    adopted: 'Adopted',
    ignored: 'Ignored',
    tooManyEntities: 'Too many entities (>100), please simplify before validating',
    applyChanges: 'Apply Changes',
    cancelChanges: 'Cancel',
    added: 'Added',
    modified: 'Modified',
    removed: 'Removed',
    deleted: 'Deleted',
    noChanges: 'No changes proposed',
    chatPlaceholder: 'Ask about your data model...',
    newSession: 'New Session',
    deleteSession: 'Delete',
    sessionList: 'Sessions',
    backToSessions: 'Back',
    noSessions: 'No conversations yet',
    retainedEntities: 'entities retained',
    continueGenerating: 'Continue Generating',
    acceptPartial: 'Accept Partial',
    stopGenerating: 'Stop',
    stopping: 'Stopping...',
    chars: 'chars',
    diffDetails: 'Changes'
  },
  propertyTypes: {
    uuid: 'UUID',
    string: 'String',
    number: 'Number',
    integer: 'Integer',
    boolean: 'Boolean',
    date: 'Date',
    stringArray: 'String Array',
    numberArray: 'Number Array',
    keyValue: 'Key-Value',
    json: 'JSON',
    enum: 'Enum'
  }
};

export const MODEL_DESIGNER_TRANSLATIONS = new InjectionToken<Signal<ModelDesignerTranslations>>(
  'MODEL_DESIGNER_TRANSLATIONS',
  { providedIn: 'root', factory: () => signal(DEFAULT_TRANSLATIONS) }
);
