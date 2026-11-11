import { Injectable } from '@angular/core';

import { SCRIPT_04_DESKTOP } from '../../runtime/04-desktop';

import { DesktopRuntimeSectionService } from './desktop-runtime-section.service';

/** Surface 运行时。 */
@Injectable({ providedIn: 'root' })
export class DesktopSurfaceRuntimeService extends DesktopRuntimeSectionService {
  readonly source = SCRIPT_04_DESKTOP;
}
