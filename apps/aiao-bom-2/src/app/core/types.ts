export const MARKETS = ['EU', 'CN', 'US', 'AU'] as const;
export type Market = (typeof MARKETS)[number];
export type Structure = 'catalog' | 'purchase' | 'cad' | 'draft';
export type ViewMode = 'tree' | 'flat' | 'summary';
export type QuantityState = 'missing' | 'ambiguous' | 'reference' | 'confirmed';
export interface ModelAsset {
  id: string;
  url: string;
  variants: string[];
  kind: 'part' | 'vehicle';
}
export interface Part {
  id: string;
  name: string;
  english: string;
  family: string;
  familyName: string;
  variants: string[];
  markets: Market[];
  marketParts: Partial<Record<Market, string>>;
  cb: Partial<Record<Market, string>>;
  mb: Partial<Record<Market, string>>;
  sb: Partial<Record<Market, string>>;
  rawQuantity: string;
  quantity: string | null;
  quantityState: QuantityState;
  uom: string;
  conflict: string;
  policy: string;
  specs: Record<string, string>;
  dimensions: number[];
  assets: ModelAsset[];
  sceneNodes: number[];
  sceneVariants: string[];
  inBom: boolean;
  photo: string | null;
  price: string | null;
  parentReference: string | null;
}
export interface Occurrence {
  key: string;
  parentKey: string | null;
  partId: string;
  label?: string;
  compId: string;
  kind: 'part' | 'system' | 'assembly';
  source: Structure;
  markets: Market[];
  quantity: string | null;
  quantityState: QuantityState;
  uom: string;
  sourceRef: string;
  nodeIndex?: number;
  unitCost?: string | null;
}
export interface BomDataset {
  schema: 'aiao-bom-2/1';
  id: string;
  title: string;
  version: string;
  observedOn: string;
  parts: Part[];
  structures: Record<Structure, Occurrence[]>;
  vehicle: { url: string; bytes: number; label: string; units: string };
  sourceUrls: string[];
}
export interface QuerySpec {
  structure: Structure;
  mode: ViewMode;
  scope: string | null;
  search: string;
  market: Market | '';
  issue: 'all' | 'conflict' | 'quantity' | 'unmapped';
  only3d: boolean;
  includeCatalog: boolean;
  sort: 'source' | 'name' | 'partId' | 'quantity';
  descending: boolean;
}
export interface BomRow {
  key: string;
  parentKey: string | null;
  partId: string;
  name: string;
  english: string;
  compId: string;
  family: string;
  familyName: string;
  quantity: string | null;
  quantityState: QuantityState;
  uom: string;
  kind: Occurrence['kind'];
  hasChildren: boolean;
  depth: number;
  has3d: boolean;
  conflict: string;
  policy: string;
  markets: string;
  path: string;
  nodeIndex?: number;
  unitCost: string | null;
  sourceRef: string;
  count: number;
  members?: string[];
  cb: string;
  mb: string;
  sb: string;
}
export interface QueryResult {
  roots: BomRow[];
  rows: BomRow[];
  byParent: Map<string | null, BomRow[]>;
  total: number;
  matched: number;
  truncated: boolean;
}
export interface DraftState {
  schema: 'aiao-bom-2-draft/1';
  datasetId: string;
  revision: number;
  name: string;
  nodes: Occurrence[];
  savedAt: string;
}
export interface DraftBranch {
  schema: 'aiao-bom-2-branch/1';
  id: string;
  datasetId: string;
  name: string;
  baseVersion: string;
  headCommitId: string | null;
  createdAt: string;
  updatedAt: string;
  dirty: boolean;
  active: boolean;
}
export interface DraftCommit {
  schema: 'aiao-bom-2-commit/1';
  id: string;
  branchId: string;
  datasetId: string;
  parentId: string | null;
  message: string;
  revision: number;
  nodeCount: number;
  createdAt: string;
  snapshotId?: string;
  draft: DraftState;
}
export interface Diagnostic {
  key: string;
  field: string;
  message: string;
}
export const DEFAULT_QUERY: QuerySpec = {
  structure: 'catalog',
  mode: 'tree',
  scope: null,
  search: '',
  market: '',
  issue: 'all',
  only3d: false,
  includeCatalog: false,
  sort: 'source',
  descending: false
};
