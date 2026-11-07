import type { RxDB, UUID } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { BomEcn, BomHeader, BomLine, BomLineOccurrence } from './entities.js';
import { BomWriteProtocolError } from './types.js';
import type { BomLineEditorValue, BomOccurrencePatch } from './view-types.js';

const readOccurrence = (db: RxDB, id: string): Promise<BomLineOccurrence> =>
  firstValueFrom(db.entityManager.getRepository(BomLineOccurrence).get(id as UUID));

const editorValue = async (db: RxDB, occurrence: BomLineOccurrence): Promise<BomLineEditorValue> => {
  const line = await firstValueFrom(db.entityManager.getRepository(BomLine).get(occurrence.lineId as UUID));
  const header = await firstValueFrom(db.entityManager.getRepository(BomHeader).get(line.headerId as UUID));
  const ecn =
    occurrence.ecnInId === null ?
      null
    : await firstValueFrom(db.entityManager.getRepository(BomEcn).get(occurrence.ecnInId as UUID));
  const editable = header.state === 'draft' || ecn?.state === 'draft';
  return {
    occurrenceId: occurrence.id,
    qty: occurrence.qty,
    componentScrap: occurrence.componentScrap,
    operationSeq: occurrence.operationSeq,
    effectiveFrom: new Date(occurrence.effectiveFrom),
    effectiveTo: occurrence.effectiveTo === null ? null : new Date(occurrence.effectiveTo),
    editable,
    readOnlyReason: editable ? null : '已发布发生项只读；变更须通过 ECN 新发生项。'
  };
};

export const loadViewOccurrence = async (db: RxDB, id: string): Promise<BomLineEditorValue> =>
  editorValue(db, await readOccurrence(db, id));

export const saveViewOccurrence = async (
  db: RxDB,
  id: string,
  patch: BomOccurrencePatch
): Promise<BomLineEditorValue> => {
  const occurrence = await readOccurrence(db, id);
  const current = await editorValue(db, occurrence);
  if (!current.editable) throw new BomWriteProtocolError('bom_line_occurrence', current.readOnlyReason!);
  await db.entityManager.getRepository(BomLineOccurrence).update(occurrence, { ...patch });
  return loadViewOccurrence(db, id);
};
