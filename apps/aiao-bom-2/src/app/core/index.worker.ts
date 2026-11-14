import { BomIndex } from './query';
import { makeStressDataset } from './stress-data';
import type { BomDataset, BomRow, Structure } from './types';
export interface IndexRequest {
  id: number;
  count?: number;
  shape?: 'balanced' | 'wide' | 'deep';
  dataset?: BomDataset;
  structure: Structure;
}
export interface IndexReply {
  id: number;
  dataset?: BomDataset;
  rows?: BomRow[];
  error?: string;
}
const worker = globalThis as unknown as {
  onmessage: ((event: MessageEvent<IndexRequest>) => void) | null;
  postMessage: (data: IndexReply) => void;
};
worker.onmessage = event => {
  const request = event.data;
  try {
    const dataset = request.dataset ?? makeStressDataset(request.count!, request.shape);
    const index = new BomIndex(dataset, request.structure);
    worker.postMessage({ id: request.id, dataset, rows: [...index.rows.values()] });
  } catch (error) {
    worker.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) });
  }
};
