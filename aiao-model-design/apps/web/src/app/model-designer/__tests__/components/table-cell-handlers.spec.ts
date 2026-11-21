import { describe, expect, it, vi } from 'vitest';
import {
  handleIndexCellChange,
  handlePropertyCellChange,
  handleRelationCellChange,
  type PropertyCellCallbacks
} from '../../components/table/table-cell-handlers';
import type { TableRecord } from '../../components/table/table.types';
import type { DesignPropertyChanges } from '../../interfaces';
import type { DesignEntity, DesignProperty, DesignRelation } from '../../models/index.js';

function entity(data: Record<string, unknown>): DesignEntity {
  return data as unknown as DesignEntity;
}

function property(data: Record<string, unknown>): DesignProperty {
  return data as unknown as DesignProperty;
}

function relation(data: Record<string, unknown>): DesignRelation {
  return data as unknown as DesignRelation;
}

function callbacks(): PropertyCellCallbacks & {
  setPropertyError: ReturnType<typeof vi.fn<(propId: string, field: 'name' | 'columnName', hasError: boolean) => void>>;
  setAddRowNameError: ReturnType<typeof vi.fn<(error: boolean) => void>>;
  revertCell: ReturnType<typeof vi.fn<(col: number, row: number, value: string | number | null) => void>>;
  emitPropertyAdded: ReturnType<typeof vi.fn<(ev: { entityId: string; name: string; type: string }) => void>>;
  emitPropertyUpdated: ReturnType<typeof vi.fn<(ev: { id: string; changes: DesignPropertyChanges }) => void>>;
} {
  return {
    setPropertyError: vi.fn<(propId: string, field: 'name' | 'columnName', hasError: boolean) => void>(),
    setAddRowNameError: vi.fn<(error: boolean) => void>(),
    revertCell: vi.fn<(col: number, row: number, value: string | number | null) => void>(),
    emitPropertyAdded: vi.fn<(ev: { entityId: string; name: string; type: string }) => void>(),
    emitPropertyUpdated: vi.fn<(ev: { id: string; changes: DesignPropertyChanges }) => void>()
  };
}

describe('table cell handlers', () => {
  it('validates add-row names and emits a trimmed property', () => {
    const cb = callbacks();
    const record: TableRecord = { _isAddRow: true, propertyType: 'number' };
    const activeEntity = entity({ id: 'entity-1' });

    handlePropertyCellChange(record, 'name', 1, 2, ' invalid name ', activeEntity, [], cb);
    expect(cb.setAddRowNameError).toHaveBeenCalledWith(true);
    expect(cb.revertCell).toHaveBeenCalledWith(1, 2, '');
    expect(cb.emitPropertyAdded).not.toHaveBeenCalled();

    handlePropertyCellChange(record, 'name', 1, 2, '  total  ', activeEntity, [], cb);
    expect(cb.setAddRowNameError).toHaveBeenLastCalledWith(false);
    expect(cb.emitPropertyAdded).toHaveBeenCalledWith({ entityId: 'entity-1', name: 'total', type: 'number' });
  });

  it('ignores invalid records and normalizes property changes', () => {
    const cb = callbacks();
    const validProperty = property({ id: 'prop-1', name: 'title' });
    const record: TableRecord = { _propId: 'prop-1' };

    handlePropertyCellChange(
      { _readonly: true, _propId: 'prop-1' },
      'name',
      0,
      0,
      'ignored',
      null,
      [validProperty],
      cb
    );
    handlePropertyCellChange(record, 'unknown', 0, 0, 'ignored', null, [validProperty], cb);
    handlePropertyCellChange({ _propId: 'missing' }, 'name', 0, 0, 'ignored', null, [validProperty], cb);
    expect(cb.emitPropertyUpdated).not.toHaveBeenCalled();

    handlePropertyCellChange(record, 'name', 0, 0, 'bad name', null, [validProperty], cb);
    handlePropertyCellChange(record, 'columnName', 0, 0, '', null, [validProperty], cb);
    handlePropertyCellChange(record, 'enumValues', 0, 0, 'draft, published, draft', null, [validProperty], cb);

    expect(cb.setPropertyError).toHaveBeenNthCalledWith(1, 'prop-1', 'name', true);
    expect(cb.setPropertyError).toHaveBeenNthCalledWith(2, 'prop-1', 'columnName', false);
    expect(cb.emitPropertyUpdated).toHaveBeenNthCalledWith(1, {
      id: 'prop-1',
      changes: { name: 'bad name' }
    });
    expect(cb.emitPropertyUpdated).toHaveBeenNthCalledWith(2, {
      id: 'prop-1',
      changes: { columnName: null }
    });
    expect(cb.emitPropertyUpdated).toHaveBeenNthCalledWith(3, {
      id: 'prop-1',
      changes: { enumValues: ['draft', 'published'] }
    });
  });

  it('allows child properties when the parent marker is present', () => {
    const cb = callbacks();

    handlePropertyCellChange({ _propId: 'child-1', _parentPropId: 'parent-1' }, 'isRequired', 0, 0, true, null, [], cb);

    expect(cb.emitPropertyUpdated).toHaveBeenCalledWith({ id: 'child-1', changes: { isRequired: true } });
  });

  it('updates relation targets and clears stale mapped properties', () => {
    const emit = vi.fn();
    const record: TableRecord = {
      _relId: 'rel-1',
      _mappedEntityId: 'user',
      _mappedPropertyId: 'old'
    };

    handleRelationCellChange(
      record,
      'mappedEntityId',
      'Account',
      [entity({ id: 'account', name: 'Account' })],
      new Map(),
      emit
    );
    expect(emit).toHaveBeenCalledWith({
      id: 'rel-1',
      changes: { mappedEntityId: 'account', mappedPropertyId: null }
    });

    handleRelationCellChange(
      { ...record, _mappedEntityId: 'account' },
      'mappedPropertyId',
      'owner',
      [],
      new Map([['account', [relation({ id: 'owner-id', name: 'owner' })]]]),
      emit
    );
    expect(emit).toHaveBeenLastCalledWith({ id: 'rel-1', changes: { mappedPropertyId: 'owner-id' } });

    handleRelationCellChange(record, 'displayName', '', [], new Map(), emit);
    expect(emit).toHaveBeenLastCalledWith({ id: 'rel-1', changes: { displayName: null } });
  });

  it('ignores non-editable relation rows and handles unknown targets', () => {
    const emit = vi.fn();

    handleRelationCellChange(undefined, 'name', 'x', [], new Map(), emit);
    handleRelationCellChange({ _readonly: true, _relId: 'rel-1' }, 'name', 'x', [], new Map(), emit);
    handleRelationCellChange({ _isAddRow: true, _relId: 'rel-1' }, 'name', 'x', [], new Map(), emit);
    handleRelationCellChange({ _relId: 'rel-1' }, 'unknown', 'x', [], new Map(), emit);
    handleRelationCellChange({ _relId: 'rel-1' }, 'mappedEntityId', 'Missing', [], new Map(), emit);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith({ id: 'rel-1', changes: { mappedEntityId: null } });
  });

  it('emits index property ids and editable fields', () => {
    const emit = vi.fn();
    const record: TableRecord = { _idxId: 'idx-1' };

    handleIndexCellChange(record, 'propertyNames', ['p1', 'p2'], emit, ['p1', 'p2']);
    handleIndexCellChange(record, 'displayName', 'Unique email', emit);
    handleIndexCellChange(record, 'isUnique', true, emit);
    handleIndexCellChange(record, 'propertyNames', 'ignored', emit);
    handleIndexCellChange({ _isAddRow: true, _idxId: 'idx-2' }, 'isUnique', true, emit);

    expect(emit).toHaveBeenCalledTimes(3);
    expect(emit).toHaveBeenNthCalledWith(1, { id: 'idx-1', changes: { propertyIds: ['p1', 'p2'] } });
    expect(emit).toHaveBeenNthCalledWith(2, { id: 'idx-1', changes: { displayName: 'Unique email' } });
    expect(emit).toHaveBeenNthCalledWith(3, { id: 'idx-1', changes: { isUnique: true } });
  });
});
