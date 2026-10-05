import type { ReplayManager } from '@aiao/rxdb-plugin-replay';
import {
  ReplayerComponent,
  replayRestoreHint,
  type ReplayerCommitRestoreEvent
} from '@aiao/rxdb-plugin-replay-angular';
import { Component, input } from '@angular/core';

export const rejectInvalidCommands = (player: ReplayerComponent, event: ReplayerCommitRestoreEvent): void => {
  player.seek('100');
  player.aoTimeChange.emit('100');
  player.aoCommitRestore.emit({ marker: event.marker, result: { ok: false, reason: 'not-a-reason' } });
  player.aoTimeChange.subscribe((time: string) => void time);
  replayRestoreHint('error');
  const sessionId: number = player.sessionId();
  const replay: string = player.replay();
  const initialTime: string = player.initialTime();
  void sessionId;
  void replay;
  void initialTime;
};

@Component({
  selector: 'review-replay-invalid-template',
  imports: [ReplayerComponent],
  template: `
    <ao-replayer
      #player
      [initialTime]="'100'"
      [replay]="123"
      [sessionId]="123"
      (aoCommitRestore)="onRestore($event)"
      (aoTimeChange)="onTime($event)"
    />
    <button (click)="player.seek('100')" type="button">错误跳转</button>
    <ao-replayer />
  `
})
export class InvalidReplayConsumer {
  readonly replay = input.required<ReplayManager>();

  onTime(time: string): void {
    void time;
  }

  onRestore(event: string): void {
    void event;
  }
}
