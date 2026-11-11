import { Injectable } from '@angular/core';

import { SCRIPT_01_SQUIRCLE } from '../../runtime/01-squircle';

import { DesktopRuntimeSectionService } from './desktop-runtime-section.service';

/** Squircle 运行时。 */
@Injectable({ providedIn: 'root' })
export class DesktopSquircleRuntimeService extends DesktopRuntimeSectionService {
  readonly source = SCRIPT_01_SQUIRCLE;
}
