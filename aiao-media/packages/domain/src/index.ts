export type MediaKind = 'image' | 'audio' | 'video';
export type GenerationStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type WorkspaceId = string & { readonly __brand: 'WorkspaceId' };
export type MediaId = string & { readonly __brand: 'MediaId' };

export interface GenerationEntity {
  id: MediaId;
  workspaceId: WorkspaceId;
  kind: MediaKind;
  status: GenerationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderInstance {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
}

export function domain(): string {
  return 'aiao-media';
}
