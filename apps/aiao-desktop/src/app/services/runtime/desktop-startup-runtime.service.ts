import { Injectable } from '@angular/core';

import { SCRIPT_13_STARTUP } from '../../runtime/13-startup';

import { DesktopRuntimeSectionService } from './desktop-runtime-section.service';

/** Startup 运行时。 */
@Injectable({ providedIn: 'root' })
export class DesktopStartupRuntimeService extends DesktopRuntimeSectionService {
  readonly source = SCRIPT_13_STARTUP;
}
