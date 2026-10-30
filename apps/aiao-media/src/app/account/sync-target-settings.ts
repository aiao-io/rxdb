import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { SyncTarget } from '../sync-target';

@Component({
  selector: 'app-sync-target-settings',
  imports: [FormsModule],
  templateUrl: './sync-target-settings.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SyncTargetSettings {
  readonly kind = input.required<SyncTarget['kind']>();
  readonly url = input.required<string>();
  readonly publicKey = input.required<string>();
  readonly platformAvailable = input.required<boolean>();
  readonly nativeMode = input.required<boolean>();
  readonly configured = input.required<boolean>();
  readonly busy = input.required<boolean>();
  readonly message = input.required<string>();
  readonly urlChanged = output<string>();
  readonly keyChanged = output<string>();
  readonly changeTarget = output<SyncTarget['kind']>();
  readonly login = output<Event>();
}
