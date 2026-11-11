import { Injectable } from '@angular/core';

import { SCRIPT_10_APPS4 } from '../../runtime/10-apps4';

import { DesktopRuntimeSectionService } from './desktop-runtime-section.service';

/** MusicSettings 运行时。 */
@Injectable({ providedIn: 'root' })
export class DesktopMusicSettingsRuntimeService extends DesktopRuntimeSectionService {
  readonly source = SCRIPT_10_APPS4;
}
