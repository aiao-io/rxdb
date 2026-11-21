import type {
  AsrGenerationJobSummary,
  AsrJobRequest,
  AudioGenerationJobSummary,
  AudioInputReference,
  AudioJobRequest,
  AudioResultMetadata,
  CreditAccount,
  MediaCapability,
  MediaCapabilityCatalog,
  MusicGenerationJobSummary,
  MusicJobRequest,
  TranscriptResult,
  VideoGenerationJobSummary,
  VideoJobRequest,
  VideoResultMetadata
} from '@aiao-media/api-contracts';
import {
  createRelayTaskToken,
  validateAsrGenerationJobSummary,
  validateAsrJobRequest,
  validateAudioGenerationJobSummary,
  validateAudioInputReference,
  validateAudioJobRequest,
  validateGenerationJobSummary,
  validateMediaCapabilityCatalog,
  validateMusicGenerationJobSummary,
  validateMusicJobRequest,
  validateVideoGenerationJobSummary,
  validateVideoJobRequest
} from '@aiao-media/api-contracts';
import { ChangeDetectionStrategy, Component, computed, effect, input, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { LocalMediaStore } from '../../local-data';
import { transcriptDownload } from '../../local-data';
import type { MediaSubmissionJob } from '../../local-data/media-submissions';
import { apiEndpoint } from '../../platform/local-backend';
import { ProviderFailure } from '../local-provider';
import type { ProductClient } from '../product-client';
import {
  deleteRelayTask,
  MediaRelayTicket,
  RelayContinuationFailure,
  RelayTicket,
  relayTickets,
  runMediaRelayTask,
  type MediaRelayResult
} from '../relay-task-client';

type MediaOperation = MediaCapability['operation'];
type MediaTaskState = {
  channel?: 'platform';
  saved?: boolean;
  acknowledged?: boolean;
};
type MediaRequest = AudioJobRequest | AsrJobRequest | MusicJobRequest | VideoJobRequest;
type MediaTask =
  | (AudioGenerationJobSummary & MediaTaskState)
  | (AsrGenerationJobSummary & MediaTaskState)
  | (MusicGenerationJobSummary & MediaTaskState)
  | (VideoGenerationJobSummary & MediaTaskState);
type MediaResult = AudioGenerationJobSummary['result'] | VideoResultMetadata | TranscriptResult;
type MediaSettlement = Pick<MediaRelayResult, 'confirm' | 'discard'>;
type InputDigest = { bytes: number; durationMs: number; sha256: string };

const digest = async (bytes: Uint8Array): Promise<string> =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)), byte =>
    byte.toString(16).padStart(2, '0')
  ).join('');
const mediaTicket = (ticket: RelayTicket | undefined): ticket is MediaRelayTicket => ticket?.kind === 'media';
const isAudioResult = (value: MediaResult | null): value is AudioResultMetadata =>
  !!value && 'mediaType' in value && value.mediaType === 'audio/wav';
const isVideoResult = (value: MediaResult | null): value is NonNullable<VideoGenerationJobSummary['result']> =>
  !!value && 'mediaType' in value && value.mediaType === 'video/mp4';
const isTranscriptResult = (value: MediaResult | null): value is TranscriptResult =>
  !!value && 'kind' in value && value.kind === 'transcript';

@Component({
  selector: 'app-media-generation',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './media-generation.html',
  styles: [
    `
      .media-generation {
        display: grid;
        gap: 1rem;
      }
      .media-modes {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .media-modes button[aria-selected='true'] {
        background: var(--ink, #202027);
        color: white;
      }
      .media-form,
      .media-result {
        display: grid;
        gap: 0.8rem;
      }
      .media-form label {
        display: grid;
        gap: 0.35rem;
      }
      .media-form textarea {
        min-height: 8rem;
        resize: vertical;
      }
      .media-fields {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
        gap: 0.75rem;
      }
      .media-result audio,
      .media-result video {
        width: 100%;
        max-height: 24rem;
      }
      .media-result textarea {
        min-height: 10rem;
      }
      .media-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.6rem;
        align-items: center;
      }
      .media-status {
        margin: 0;
      }
      .media-error {
        color: #a32929;
      }
    `
  ]
})
export class MediaGeneration implements OnDestroy {
  private inputReference: AudioInputReference | null = null;
  private tickets: Record<string, RelayTicket> = {};
  private generation = 0;
  private readonly lifetime = new AbortController();
  private ownedResultUrl: string | null = null;
  private ownedDownloadUrl: string | null = null;
  private settlement: MediaSettlement | null = null;
  private resultBlob: Blob | null = null;
  private submissionInFlight = false;

  readonly client = input.required<ProductClient>();
  readonly store = input<LocalMediaStore | null>(null);
  readonly authReady = input(false);
  readonly workspaceKey = input('');
  readonly credits = input<CreditAccount | null>(null);

  readonly operation = signal<MediaOperation>('text-to-speech');
  readonly capabilities = signal<MediaCapabilityCatalog | null>(null);
  readonly capabilityBusy = signal(false);
  readonly capabilityMessage = signal('');
  readonly text = signal('');
  readonly language = signal('');
  readonly voiceId = signal('');
  readonly speed = signal(1);
  readonly musicDuration = signal(5);
  readonly musicInstrumental = signal(true);
  readonly videoRatio = signal('16:9');
  readonly videoDuration = signal(5);
  readonly videoResolution = signal('768P');
  readonly inputName = signal('');
  readonly inputBusy = signal(false);
  readonly inputMessage = signal('');
  readonly task = signal<MediaTask | null>(null);
  readonly result = signal<MediaResult | null>(null);
  readonly resultUrl = signal<string | null>(null);
  readonly downloadUrl = signal<string | null>(null);
  readonly saved = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly copied = signal(false);

  readonly selectedCapability = computed(
    () => this.capabilities()?.capabilities.find(item => item.operation === this.operation()) ?? null
  );
  readonly textToSpeechCapability = computed(() => {
    const capability = this.selectedCapability();
    return capability?.operation === 'text-to-speech' ? capability : null;
  });
  readonly speechToTextCapability = computed(() => {
    const capability = this.selectedCapability();
    return capability?.operation === 'speech-to-text' ? capability : null;
  });
  readonly textToMusicCapability = computed(() => {
    const capability = this.selectedCapability();
    return capability?.operation === 'text-to-music' ? capability : null;
  });
  readonly textToVideoCapability = computed(() => {
    const capability = this.selectedCapability();
    return capability?.operation === 'text-to-video' ? capability : null;
  });
  readonly textMaxLength = computed(() => {
    const capability = this.selectedCapability();
    return capability && 'textMaxLength' in capability.input ? capability.input.textMaxLength : null;
  });
  readonly audioResult = computed(() => {
    const value = this.result();
    return isAudioResult(value) ? value : null;
  });
  readonly videoResult = computed(() => {
    const value = this.result();
    return isVideoResult(value) ? value : null;
  });
  readonly transcriptResult = computed(() => {
    const value = this.result();
    return isTranscriptResult(value) ? value : null;
  });
  readonly canSubmit = computed(() => {
    const capability = this.selectedCapability();
    if (!capability || !this.authReady() || !this.store() || this.busy()) return false;
    if (this.operation() === 'speech-to-text') return this.inputReference !== null;
    const maxLength = this.textMaxLength();
    return maxLength !== null && this.text().trim().length > 0 && this.text().trim().length <= maxLength;
  });
  readonly statusLabel = computed(() => {
    const task = this.task();
    if (!task) return '等待输入';
    if (task.status === 'processing' || task.status === 'queued') return '正在生成';
    if (task.status === 'completed' && this.saved()) return '已保存到本机';
    if (task.status === 'completed') return '结果待保存';
    if (task.status === 'needs_review') return '待核查平台任务';
    return '任务失败';
  });
  readonly downloadName = computed(() => {
    const id = this.task()?.id ?? 'media';
    return (
      this.operation() === 'speech-to-text' ? `transcript-${id}.txt`
      : this.operation() === 'text-to-video' ? `video-${id}.mp4`
      : `audio-${id}.wav`
    );
  });

  constructor() {
    effect(() => {
      const store = this.store();
      const workspaceKey = this.workspaceKey();
      if (!store || !workspaceKey) return;
      const generation = ++this.generation;
      void this.loadWorkspace(store, generation);
    });
    void this.loadCapabilities();
  }

  ngOnDestroy(): void {
    this.lifetime.abort();
    this.revokeResultUrls();
  }

  async loadCapabilities(): Promise<void> {
    if (this.capabilityBusy()) return;
    this.capabilityBusy.set(true);
    this.capabilityMessage.set('');
    try {
      const response = await fetch(apiEndpoint('/api/media/capabilities'), {
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        signal: this.lifetime.signal
      });
      if (!response.ok) throw new Error('媒体能力目录暂不可用，请刷新重试。');
      const catalog = validateMediaCapabilityCatalog(await response.json());
      this.capabilities.set(catalog);
      this.resetOperationDefaults(this.selectedCapability());
    } catch (error) {
      if (!this.lifetime.signal.aborted)
        this.capabilityMessage.set(error instanceof Error ? error.message : '媒体能力目录暂不可用。');
    } finally {
      this.capabilityBusy.set(false);
    }
  }

  selectOperation(operation: MediaOperation): void {
    if (this.busy()) return;
    this.operation.set(operation);
    this.resetOperationDefaults(this.capabilities()?.capabilities.find(item => item.operation === operation) ?? null);
    this.clearResult();
  }

  async selectFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file || this.inputBusy()) return;
    this.inputBusy.set(true);
    this.inputMessage.set('');
    this.error.set('');
    try {
      const capability = this.capabilities()?.capabilities.find(item => item.operation === 'speech-to-text');
      if (!capability || capability.operation !== 'speech-to-text') throw new Error('ASR 能力目录不可用。');
      const parsed = await this.readWav(file);
      if (parsed.bytes > capability.input.maxBytes || parsed.durationMs > capability.input.maxDurationMs)
        throw new Error('音频超过当前 ASR 能力的大小或时长限制。');
      const access = await this.client().authorization();
      const response = await fetch(apiEndpoint('/api/media/inputs'), {
        method: 'POST',
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        headers: { authorization: `Bearer ${access.session.access_token}`, 'content-type': 'audio/wav' },
        body: file,
        signal: this.lifetime.signal
      });
      if (!response.ok) throw new Error('音频上传失败，请检查格式后重试。');
      const reference = validateAudioInputReference(await response.json());
      this.inputReference = reference;
      this.inputName.set(file.name);
      this.language.set('');
      this.inputMessage.set(`已上传 ${file.name}，${Math.round(reference.durationMs / 1000)} 秒`);
    } catch (error) {
      this.inputReference = null;
      this.inputName.set('');
      this.inputMessage.set(error instanceof Error ? error.message : '音频上传失败。');
    } finally {
      this.inputBusy.set(false);
    }
  }

  async submit(): Promise<void> {
    const store = this.store();
    const capability = this.selectedCapability();
    if (!store || !capability || !this.canSubmit() || this.submissionInFlight) return;
    this.submissionInFlight = true;
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    let submissionKey = '';
    let taskId = '';
    try {
      const access = await this.client().authorization();
      const balance = await this.client().credits();
      if (balance.account.available < capability.credits)
        throw new Error(`可用积分不足，本次需要 ${capability.credits} 积分。`);
      const request = this.buildRequest(capability);
      const current = this.task();
      if (
        current &&
        ['completed', 'needs_review'].includes(current.status) &&
        JSON.stringify(current.request) === JSON.stringify(request)
      )
        return;
      const submission = await store.createMediaSubmission(request);
      submissionKey = submission.key;
      if (!submission.firstSentAt) await store.markMediaSubmissionSent(submission.key);
      taskId = submission.idempotencyKey;
      const now = new Date().toISOString();
      const task = this.pendingTask(taskId, request, now);
      const ticket: MediaRelayTicket = { token: createRelayTaskToken(), accepted: false, kind: 'media' };
      await this.writeTask(task, ticket);
      this.task.set(task);
      const result = await runMediaRelayTask({
        id: taskId,
        ticket,
        request,
        accessToken: access.session.access_token,
        signal: this.lifetime.signal,
        accepted: async () => {
          ticket.accepted = true;
          await this.writeTicket(taskId, ticket);
        }
      });
      const completed = {
        ...task,
        status: 'completed' as const,
        updatedAt: new Date().toISOString(),
        delivery: { status: 'available' as const, expiresAt: null, acknowledgedAt: null },
        failure: null,
        result: result.manifest,
        ...(result.providerRequestId ? { providerRequestId: result.providerRequestId } : {})
      } as MediaTask;
      await store.confirmMediaSubmission(submissionKey, this.protocolTask(completed));
      await this.writeTask(completed, ticket);
      this.task.set(completed);
      this.setResult(result.manifest, result.blob, result);
      await this.saveCompleted(store, completed, result);
    } catch (error) {
      if (this.lifetime.signal.aborted) return;
      if (error instanceof RelayContinuationFailure) {
        this.error.set(error.message);
        return;
      }
      const current = this.task();
      if (current && taskId && submissionKey) {
        const rejected = error instanceof ProviderFailure && error.rejected;
        const failed = {
          ...current,
          status: rejected ? ('failed' as const) : ('needs_review' as const),
          updatedAt: new Date().toISOString(),
          delivery: { status: 'unavailable' as const, expiresAt: null, acknowledgedAt: null },
          failure: {
            category: rejected ? ('invalid_request' as const) : ('dispatch_uncertain' as const),
            retryable: !rejected
          }
        } as MediaTask;
        try {
          await store.confirmMediaSubmission(submissionKey, this.protocolTask(failed));
          await this.writeTask(failed, this.tickets[taskId]);
          this.task.set(failed);
          if (rejected) {
            await store.markMediaSubmissionHandled(taskId);
            await this.releaseTicket(taskId);
          }
        } catch {
          this.message.set('任务状态未能写回本机，请保留当前页面并刷新核对。');
        }
      }
      this.error.set(error instanceof Error ? error.message : '媒体任务失败，请核对任务状态。');
    } finally {
      this.submissionInFlight = false;
      this.busy.set(false);
    }
  }

  async retrySave(): Promise<void> {
    const store = this.store();
    const task = this.task();
    if (!store || !task || !this.result()) return;
    const blob = this.resultBlob;
    if (!blob) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.saveStoredResult(store, task, blob);
      const savedTask = { ...task, saved: true, updatedAt: new Date().toISOString() } as MediaTask;
      await this.writeTask(savedTask, this.tickets[task.id]);
      const settlement = this.settlement;
      if (!settlement) throw new Error('媒体结算上下文已丢失，请刷新继续原任务。');
      await this.confirmAndHandle(store, savedTask, settlement);
      this.task.set(savedTask);
      await this.releaseTicket(task.id);
      await this.deleteInputIfHandled(savedTask.request);
      this.saved.set(true);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : '本机保存失败，请释放空间后重试。');
    } finally {
      this.busy.set(false);
    }
  }

  async acknowledge(): Promise<void> {
    const store = this.store();
    const task = this.task();
    if (!store || !task || task.status !== 'needs_review' || task.acknowledged) return;
    try {
      const acknowledged = { ...task, acknowledged: true, updatedAt: new Date().toISOString() } as MediaTask;
      await this.writeTask(acknowledged, this.tickets[task.id]);
      await store.markMediaSubmissionHandled(task.id);
      this.task.set(acknowledged);
      await this.releaseTicket(task.id);
      this.message.set('已记录待核查结果，不会自动重新生成。');
    } catch {
      this.error.set('核对记录保存失败，请重试。');
    }
  }

  async copyTranscript(): Promise<void> {
    const result = this.result();
    if (!isTranscriptResult(result)) return;
    try {
      await navigator.clipboard.writeText(result.text);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1200);
    } catch {
      this.error.set('复制失败，请手动选择文本。');
    }
  }

  transcriptDownload(): Blob | null {
    const result = this.result();
    return isTranscriptResult(result) ? transcriptDownload(result) : null;
  }

  private async loadWorkspace(store: LocalMediaStore, generation: number): Promise<void> {
    try {
      const rows = await store.collection('tasks');
      const relay = await store.preference('relay-tasks-v1');
      if (generation !== this.generation || store !== this.store()) return;
      this.tickets = relayTickets(relay?.payload ?? null);
      const tasks = rows.map(row => this.decodeTask(row.payload)).filter((task): task is MediaTask => task !== null);
      const current = tasks.find(
        item =>
          item.status === 'needs_review' ||
          (mediaTicket(this.tickets[item.id]) && (item.status === 'processing' || item.status === 'completed'))
      );
      if (!current) return;
      this.task.set(current);
      if (current.status === 'needs_review') return;
      const ticket = this.tickets[current.id];
      if (mediaTicket(ticket)) void this.resume(current, ticket, generation);
    } catch (error) {
      if (generation === this.generation)
        this.message.set(error instanceof Error ? error.message : '媒体任务读取失败，请刷新重试。');
    }
  }

  private async resume(task: MediaTask, ticket: MediaRelayTicket, generation: number): Promise<void> {
    if (this.busy() || generation !== this.generation) return;
    this.busy.set(true);
    try {
      const result = await runMediaRelayTask({
        id: task.id,
        ticket,
        request: null,
        signal: this.lifetime.signal,
        accepted: async () => {
          ticket.accepted = true;
          await this.writeTicket(task.id, ticket);
        }
      });
      if (generation !== this.generation) return;
      const completed = {
        ...task,
        status: 'completed' as const,
        updatedAt: new Date().toISOString(),
        delivery: { status: 'available' as const, expiresAt: null, acknowledgedAt: null },
        failure: null,
        result: result.manifest,
        ...(result.providerRequestId ? { providerRequestId: result.providerRequestId } : {})
      } as MediaTask;
      const submission = (await this.store()!.mediaSubmissions()).find(item => item.idempotencyKey === task.id);
      if (!submission) throw new Error('媒体结果没有对应的本机提交意图。');
      await this.store()!.confirmMediaSubmission(submission.key, this.protocolTask(completed));
      await this.writeTask(completed, ticket);
      this.task.set(completed);
      this.setResult(result.manifest, result.blob, result);
      await this.saveCompleted(this.store()!, completed, result);
    } catch (error) {
      if (error instanceof RelayContinuationFailure) this.error.set(error.message);
      else this.error.set(error instanceof Error ? error.message : '原媒体任务续接失败，请刷新重试。');
    } finally {
      this.busy.set(false);
    }
  }

  private async saveCompleted(store: LocalMediaStore, task: MediaTask, result: MediaRelayResult): Promise<void> {
    try {
      await this.saveStoredResult(store, task, result.blob);
      const savedTask = { ...task, saved: true, updatedAt: new Date().toISOString() } as MediaTask;
      await this.writeTask(savedTask, this.tickets[task.id]);
      const settlement = this.settlement;
      if (!settlement) throw new Error('媒体结算上下文已丢失，请刷新继续原任务。');
      await this.confirmAndHandle(store, savedTask, settlement);
      this.task.set(savedTask);
      await this.releaseTicket(task.id);
      await this.deleteInputIfHandled(savedTask.request);
      this.saved.set(true);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : '媒体结果已收到，但本机保存未完成。');
    }
  }

  private async saveStoredResult(store: LocalMediaStore, task: MediaTask, blob: Blob): Promise<void> {
    const protocol = this.protocolTask(task);
    if (task.request.operation === 'speech-to-text') {
      await store.saveTranscript(validateAsrGenerationJobSummary(protocol));
      return;
    }
    if (task.request.operation === 'text-to-speech') {
      await store.saveMediaResult(validateAudioGenerationJobSummary(protocol), blob);
      return;
    }
    if (task.request.operation === 'text-to-music') {
      await store.saveMediaResult(validateMusicGenerationJobSummary(protocol), blob);
      return;
    }
    if (task.request.operation === 'text-to-video') {
      await store.saveMediaResult(validateVideoGenerationJobSummary(protocol), blob);
      return;
    }
    throw new Error('媒体任务 operation 无效。');
  }

  private async confirmAndHandle(store: LocalMediaStore, task: MediaTask, settlement: MediaSettlement): Promise<void> {
    await settlement.confirm();
    await store.markMediaSubmissionHandled(task.id);
  }

  private async releaseTicket(id: string): Promise<void> {
    const store = this.store();
    const ticket = this.tickets[id];
    if (!store || !ticket) return;
    try {
      await deleteRelayTask(id, ticket, this.lifetime.signal);
      const row = await store.preference('relay-tasks-v1');
      const current = relayTickets(row?.payload ?? null);
      const next = Object.fromEntries(Object.entries(current).filter(([key]) => key !== id));
      await store.savePreference('relay-tasks-v1', JSON.stringify(next), row?.revision ?? null);
      delete this.tickets[id];
      this.settlement = null;
    } catch {
      this.message.set('媒体任务已结算，本机令牌清理未完成；刷新后会继续清理。');
    }
  }

  private async writeTicket(id: string, ticket: MediaRelayTicket): Promise<void> {
    const store = this.store();
    if (!store) throw new Error('本机工作区不可用。');
    this.tickets = { ...this.tickets, [id]: ticket };
    const row = await store.preference('relay-tasks-v1');
    const current = relayTickets(row?.payload ?? null);
    await store.savePreference('relay-tasks-v1', JSON.stringify({ ...current, [id]: ticket }), row?.revision ?? null);
  }

  private protocolTask(task: MediaTask): MediaSubmissionJob {
    const value = { ...task };
    delete value.channel;
    delete value.saved;
    delete value.acknowledged;
    return validateGenerationJobSummary(value) as MediaSubmissionJob;
  }

  private async writeTask(task: MediaTask, ticket?: RelayTicket): Promise<void> {
    const store = this.store();
    if (!store) throw new Error('本机工作区不可用。');
    const valid = this.protocolTask(task);
    const row = await store.preference('tasks-v1');
    const relay = ticket ? await store.preference('relay-tasks-v1') : null;
    const existing = row ? (JSON.parse(row.payload) as unknown[]) : [];
    const next = [
      {
        ...valid,
        channel: 'platform',
        ...(task.saved === undefined ? {} : { saved: task.saved }),
        ...(task.acknowledged === undefined ? {} : { acknowledged: task.acknowledged })
      },
      ...existing.filter(value => {
        if (!value || typeof value !== 'object') return true;
        return (value as Record<string, unknown>)['id'] !== task.id;
      })
    ].slice(0, 100);
    await store.savePreferences(
      [
        { key: 'tasks-v1', payload: JSON.stringify(next), revision: row?.revision ?? null },
        ...(ticket ?
          [
            {
              key: 'relay-tasks-v1',
              payload: JSON.stringify({ ...relayTickets(relay?.payload ?? null), [task.id]: ticket }),
              revision: relay?.revision ?? null
            }
          ]
        : [])
      ],
      true
    );
    if (ticket) this.tickets = { ...this.tickets, [task.id]: ticket };
  }

  private decodeTask(payload: string): MediaTask | null {
    const value = JSON.parse(payload) as Record<string, unknown>;
    const { saved, acknowledged, ...raw } = value;
    delete raw['channel'];
    const task = validateGenerationJobSummary(raw);
    if (task.request.kind === 'image') return null;
    return {
      ...task,
      channel: 'platform',
      ...(typeof saved === 'boolean' ? { saved } : {}),
      ...(typeof acknowledged === 'boolean' ? { acknowledged } : {})
    } as MediaTask;
  }

  private pendingTask(id: string, request: MediaRequest, now: string): MediaTask {
    return {
      id,
      request,
      status: 'processing',
      createdAt: now,
      updatedAt: now,
      delivery: { status: 'pending', expiresAt: null, acknowledgedAt: null },
      failure: null,
      result: null,
      channel: 'platform'
    } as MediaTask;
  }

  private buildRequest(capability: MediaCapability): MediaRequest {
    const base = {
      providerInstanceId: capability.providerInstanceId,
      providerRevision: capability.providerRevision,
      modelId: capability.modelId
    };
    const operation = capability.operation;
    if (operation === 'speech-to-text') {
      if (!this.inputReference) throw new Error('请先上传 WAV 音频。');
      return validateAsrJobRequest({
        kind: 'audio',
        operation,
        ...base,
        language: this.language() || null,
        input: this.inputReference
      });
    }
    if (operation === 'text-to-speech')
      return validateAudioJobRequest({
        kind: 'audio',
        operation,
        ...base,
        language: this.language(),
        voiceId: this.voiceId(),
        speed: this.speed(),
        text: this.text().trim()
      });
    if (operation === 'text-to-music')
      return validateMusicJobRequest({
        kind: 'audio',
        operation,
        ...base,
        prompt: this.text().trim(),
        parameters: { durationSeconds: this.musicDuration(), instrumental: this.musicInstrumental() }
      });
    return validateVideoJobRequest({
      kind: 'video',
      operation,
      ...base,
      prompt: this.text().trim(),
      parameters: {
        ratio: this.videoRatio(),
        durationSeconds: this.videoDuration(),
        resolution: this.videoResolution()
      }
    });
  }

  private resetOperationDefaults(capability: MediaCapability | null): void {
    if (!capability) return;
    if (capability.operation === 'text-to-speech') {
      this.language.set(capability.parameters.languages[0] ?? '');
      this.voiceId.set(capability.parameters.voices[0]?.id ?? '');
      this.speed.set(capability.parameters.speeds[0] ?? 1);
    }
    if (capability.operation === 'text-to-music') {
      this.musicDuration.set(capability.parameters.durationsSeconds[0] ?? 5);
      this.musicInstrumental.set(capability.parameters.instrumental[0] ?? true);
    }
    if (capability.operation === 'text-to-video') {
      this.videoRatio.set(capability.parameters.ratios[0] ?? '16:9');
      this.videoDuration.set(capability.parameters.durationsSeconds[0] ?? 5);
      this.videoResolution.set(capability.parameters.resolutions[0] ?? '768P');
    }
  }

  private async readWav(file: File): Promise<InputDigest> {
    if (file.type !== 'audio/wav') throw new Error('ASR 仅支持 audio/wav。');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength < 46) throw new Error('WAV 文件过短。');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const text = (offset: number, length: number) => new TextDecoder().decode(bytes.subarray(offset, offset + length));
    if (text(0, 4) !== 'RIFF' || text(8, 4) !== 'WAVE') throw new Error('ASR 仅支持有效的 WAV 文件。');
    let sampleRate = 0;
    let channels = 0;
    let bits = 0;
    let dataBytes = 0;
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const size = view.getUint32(offset + 4, true);
      const next = offset + 8 + size + (size % 2);
      if (next > bytes.length) throw new Error('WAV 数据块不完整。');
      const type = text(offset, 4);
      if (type === 'fmt ' && size >= 16) {
        if (view.getUint16(offset + 8, true) !== 1) throw new Error('ASR 只支持 PCM WAV。');
        channels = view.getUint16(offset + 10, true);
        sampleRate = view.getUint32(offset + 12, true);
        bits = view.getUint16(offset + 22, true);
      }
      if (type === 'data') dataBytes = size;
      offset = next;
    }
    if (!sampleRate || ![1, 2].includes(channels) || ![8, 16, 24, 32].includes(bits) || !dataBytes)
      throw new Error('WAV 音频格式不受支持。');
    const durationMs = Math.round((dataBytes / ((sampleRate * channels * bits) / 8)) * 1000);
    if (!Number.isSafeInteger(durationMs) || durationMs <= 0) throw new Error('无法读取 WAV 时长。');
    return { bytes: bytes.byteLength, durationMs, sha256: await digest(bytes) };
  }

  private setResult(value: MediaResult, blob: Blob, settlement: MediaSettlement): void {
    this.revokeResultUrls();
    this.result.set(value);
    this.resultBlob = blob;
    this.settlement = settlement;
    if (isAudioResult(value) || isVideoResult(value)) {
      this.ownedResultUrl = URL.createObjectURL(blob);
      this.ownedDownloadUrl = this.ownedResultUrl;
    } else if (isTranscriptResult(value)) {
      this.ownedDownloadUrl = URL.createObjectURL(transcriptDownload(value));
    }
    this.resultUrl.set(this.ownedResultUrl);
    this.downloadUrl.set(this.ownedDownloadUrl);
  }

  private clearResult(): void {
    this.revokeResultUrls();
    this.result.set(null);
    this.resultBlob = null;
    this.settlement = null;
    this.saved.set(false);
  }

  private revokeResultUrls(): void {
    if (this.ownedResultUrl) URL.revokeObjectURL(this.ownedResultUrl);
    if (this.ownedDownloadUrl && this.ownedDownloadUrl !== this.ownedResultUrl)
      URL.revokeObjectURL(this.ownedDownloadUrl);
    this.ownedResultUrl = null;
    this.ownedDownloadUrl = null;
    this.resultUrl.set(null);
    this.downloadUrl.set(null);
  }

  private async deleteInputIfHandled(request: MediaRequest): Promise<void> {
    if (request.operation !== 'speech-to-text') return;
    const reference = request.input;
    try {
      const access = await this.client().authorization();
      const response = await fetch(apiEndpoint(`/api/media/inputs/${reference.id}`), {
        method: 'DELETE',
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        headers: { authorization: `Bearer ${access.session.access_token}` },
        signal: this.lifetime.signal
      });
      if (!response.ok && response.status !== 404) {
        this.message.set('ASR 输入已完成任务，但临时输入清理失败，请重试。');
        return;
      }
      this.inputReference = null;
      this.inputName.set('');
    } catch {
      this.message.set('ASR 输入已完成任务，但临时输入清理未确认。');
    }
  }
}
