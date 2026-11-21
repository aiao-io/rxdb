import { describe, expect, it } from 'vitest';
import { detectCellError } from '../../components/table/table-tooltip';
import type { TableRecord } from '../../components/table/table.types';

const hints = {
  propertyNameHint: 'property name',
  columnNameHint: 'column name',
  relationNameHint: 'relation name',
  relationTargetEntityHint: 'target entity',
  relationMappedPropertyHint: 'mapped property',
  missingInverseRelationHint: 'missing inverse'
};

const emptyPropertyContext = {
  propertyErrors: new Map(),
  addRowNameError: false
};

const emptyRelationContext = {
  invalidRelationIds: new Set<string>(),
  relationFieldErrors: new Map(),
  missingInverseRelationIds: new Set<string>()
};

function record(value: Record<string, unknown>): TableRecord {
  return value as TableRecord;
}

describe('detectCellError', () => {
  it('reports property name and column errors while ignoring unrelated cells', () => {
    const propCtx = {
      propertyErrors: new Map([
        ['prop-1', { name: true, columnName: true }],
        ['prop-2', { name: false, columnName: false }]
      ]),
      addRowNameError: true
    };

    expect(detectCellError('properties', record({ _isAddRow: true }), 'name', propCtx, emptyRelationContext, hints)).toEqual({
      isError: true,
      content: 'property name'
    });
    expect(detectCellError('properties', record({ _propId: 'prop-1' }), 'name', propCtx, emptyRelationContext, hints)).toEqual({
      isError: true,
      content: 'property name'
    });
    expect(
      detectCellError('properties', record({ _propId: 'prop-1' }), 'columnName', propCtx, emptyRelationContext, hints)
    ).toEqual({ isError: true, content: 'column name' });
    expect(detectCellError('properties', record({ _propId: 'prop-2' }), 'name', propCtx, emptyRelationContext, hints)).toEqual({
      isError: false
    });
    expect(detectCellError('properties', record({}), 'displayName', propCtx, emptyRelationContext, hints)).toEqual({
      isError: false
    });
  });

  it('combines relation field and missing inverse errors', () => {
    const relCtx = {
      invalidRelationIds: new Set<string>(),
      relationFieldErrors: new Map([
        ['rel-1', new Set(['name'])],
        ['rel-2', new Set(['mappedEntityId'])],
        ['rel-3', new Set(['mappedPropertyId'])],
        ['rel-4', new Set(['unknown'] as never)]
      ]),
      missingInverseRelationIds: new Set(['rel-2', 'rel-5'])
    };

    expect(detectCellError('relations', record({}), 'name', emptyPropertyContext, relCtx, hints)).toEqual({ isError: false });
    expect(detectCellError('relations', record({ _relId: 'rel-1' }), 'name', emptyPropertyContext, relCtx, hints)).toEqual({
      isError: true,
      content: 'relation name'
    });
    expect(
      detectCellError('relations', record({ _relId: 'rel-2' }), 'mappedEntityId', emptyPropertyContext, relCtx, hints)
    ).toEqual({ isError: true, content: 'target entity · missing inverse' });
    expect(
      detectCellError('relations', record({ _relId: 'rel-3' }), 'mappedPropertyId', emptyPropertyContext, relCtx, hints)
    ).toEqual({ isError: true, content: 'mapped property' });
    expect(detectCellError('relations', record({ _relId: 'rel-4' }), 'unknown', emptyPropertyContext, relCtx, hints)).toEqual({
      isError: true,
      content: 'target entity'
    });
    expect(detectCellError('relations', record({ _relId: 'rel-5' }), undefined, emptyPropertyContext, relCtx, hints)).toEqual({
      isError: true,
      content: 'missing inverse'
    });
    expect(detectCellError('relations', record({ _relId: 'rel-6' }), 'name', emptyPropertyContext, relCtx, hints)).toEqual({
      isError: false
    });
  });

  it('returns no error for tabs without validation rules', () => {
    expect(detectCellError('indexes', record({ _idxId: 'idx-1' }), 'displayName', emptyPropertyContext, emptyRelationContext, hints)).toEqual({
      isError: false
    });
  });
});
