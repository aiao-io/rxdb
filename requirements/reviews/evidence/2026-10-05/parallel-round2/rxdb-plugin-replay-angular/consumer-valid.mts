import type { ReplayManager } from '@aiao/rxdb-plugin-replay';
import {
  ReplayerComponent,
  replayRestoreHint,
  type ReplayerCommitRestoreEvent
} from '@aiao/rxdb-plugin-replay-angular';
import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';

@Component({
  selector: 'review-replay-consumer',
  imports: [ReplayerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ao-replayer
      #player
      [initialTime]="initialTime()"
      [replay]="replay()"
      [sessionId]="sessionId()"
      (aoCommitRestore)="onRestore($event)"
      (aoTimeChange)="time.set($event)"
    />
    <button (click)="player.play()" type="button">播放</button>
    <button (click)="player.pause()" type="button">暂停</button>
    <button (click)="player.seek(100)" type="button">跳转</button>
    @if (hint(); as message) {
      <p role="alert">{{ message }}</p>
    }
  `
})
export class ValidReplayConsumer {
  readonly replay = input.required<ReplayManager>();
  readonly sessionId = input.required<string>();
  readonly initialTime = input<number>();
  readonly time = signal(0);
  readonly hint = signal<string | null>(null);

  onRestore({ result }: ReplayerCommitRestoreEvent): void {
    if (result.ok) {
      const revision: number = result.workingTreeRevision;
      this.hint.set(`revision:${revision}`);
      return;
    }
    this.hint.set(result.reason === 'error' ? result.error.message : replayRestoreHint(result.reason));
  }
}

export const consumeCommands = (player: ReplayerComponent): void => {
  const sessionId: string = player.sessionId();
  const initialTime: number | undefined = player.initialTime();
  const replay: ReplayManager = player.replay();
  player.play();
  player.pause();
  player.seek(initialTime ?? 0);
  const timeSubscription = player.aoTimeChange.subscribe((timeMs: number) => void timeMs);
  const restoreSubscription = player.aoCommitRestore.subscribe((event: ReplayerCommitRestoreEvent) => void event);
  timeSubscription.unsubscribe();
  restoreSubscription.unsubscribe();
  void sessionId;
  void replay;
};
