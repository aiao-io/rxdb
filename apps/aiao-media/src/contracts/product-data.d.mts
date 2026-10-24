import type { PromptTemplate } from '../app/prompts/prompt-catalog';
import type { StudioPromptState } from '../local-data/studio-draft';
export type ProductRecordKind = 'draft' | 'provider' | 'work';
export function productRecordId(workspaceId: string, kind: ProductRecordKind, sourceId: string): Promise<string>;
export interface PublicProviderPayload {
  version: 1;
  name: string;
  baseUrl: string;
  model: string;
  mode: 'direct' | 'proxy';
}
export interface PublicWorkPayload {
  version: 1;
  jobId: string;
  prompt: string;
  modelId: string;
  providerInstanceId: string;
  mimeType: 'image/png';
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  createdAt: string;
}
export interface PublicDraftPayload {
  version: 1;
  state: StudioPromptState;
}
export type ProductRecordPayload = PublicProviderPayload | PublicWorkPayload | PublicDraftPayload;
export function productPayloadText(kind: ProductRecordKind, input: unknown): string;
export interface TaskReport {
  id: string;
  taskId: string;
  workspaceId: string;
  model: string;
  providerId: string;
  channel: 'direct' | 'proxy';
  status: 'processing' | 'completed' | 'failed' | 'needs_review';
  startedAt: string;
  source: 'application' | 'provider' | 'verified';
  requestCount: number | null;
  providerUnits: number | null;
  verifiedCost: number | null;
  currency: string | null;
}
export function validateSyncPayload(kind: 'draft', value: unknown): PublicDraftPayload;
export function validateSyncPayload(kind: 'provider', value: unknown): PublicProviderPayload;
export function validateSyncPayload(kind: 'work', value: unknown): PublicWorkPayload;
export function validateSyncPayload(kind: ProductRecordKind, value: unknown): ProductRecordPayload;
export function validatePublishedTemplate(value: unknown): PromptTemplate;
export function validateTaskReport(value: unknown): TaskReport;

export interface ProviderPolicyEntry {
  id: string;
  name: string;
  baseUrl: string;
  models: string[];
  sizes: string[];
  enabled: boolean;
  direct: boolean;
  proxy: boolean;
}
export interface ProviderPolicy {
  version: 1;
  providers: ProviderPolicyEntry[];
}
export function validateProviderPolicy(value: unknown): ProviderPolicy;
