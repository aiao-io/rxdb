import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { SyncTarget } from '../sync-target';

@Component({
  selector: 'app-sync-target-settings',
  templateUrl: './sync-target-settings.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SyncTargetSettings {
  readonly kind = input.required<SyncTarget['kind']>();
  readonly platformAvailable = input.required<boolean>();
  readonly nativeMode = input.required<boolean>();
  readonly configured = input.required<boolean>();
  readonly busy = input.required<boolean>();
  readonly message = input.required<string>();
  readonly changeTarget = output<SyncTarget['kind']>();
  readonly login = output<Event>();
}
