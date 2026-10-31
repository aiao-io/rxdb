import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import type { GenerationStatus, MediaKind } from '../contracts/index';

@Entity({
  name: 'MediaGeneration',
  tableName: 'media_generation',
  namespace: 'media',
  log: false,
  properties: [
    { name: 'kind', type: PropertyType.string, required: true },
    { name: 'prompt', type: PropertyType.string, required: true },
    { name: 'status', type: PropertyType.string, required: true }
  ]
})
export class MediaGeneration extends EntityBase {
  kind!: MediaKind;
  prompt!: string;
  status!: GenerationStatus;
}

export function createMediaDatabase(): RxDB {
  return new RxDB({
    dbName: 'aiao-media',
    context: { userId: 'local' },
    entities: [MediaGeneration],
    sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
  });
}

export { BrowserMediaStore, LocalMediaError, LocalMediaStore } from './browser-media';
export type {
  LocalAssetSummary,
  LocalDraftSummary,
  LocalImageInfo,
  LocalMediaWorkSummary,
  LocalReferenceState,
  LocalReferenceSummary,
  LocalWorkSummary
} from './browser-media';
export type { LocalWorkFilters, LocalWorkQuery } from './library-query';

export { NotebookError } from './draft-notebook';
export type { DraftNotebook, NotebookDraft } from './draft-notebook';

export { ImageSubmissionError, imageSubmissionRequest } from './image-submissions';
export type { ImageDraftSource, ImageSubmissionSelection, LocalImageSubmission } from './image-submissions';

export type { LocalAudioSubmission } from './audio-submissions';

export type { LocalVideoSubmission } from './video-submissions';

export { ownedStudioPrompt, readStudioPayload, STUDIO_DRAFT_MAX_BYTES, studioPayload } from './studio-draft';
export type { StudioDraftSnapshot, StudioPromptState } from './studio-draft';

export { decodeVideoPreview } from './media-result';
export type { LocalAssetKind, LocalAssetResult } from './media-result';
