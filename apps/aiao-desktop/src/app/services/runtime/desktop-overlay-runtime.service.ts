import { Injectable } from '@angular/core';

import { SCRIPT_12_OVERLAYS } from '../../runtime/12-overlays';

import { DesktopRuntimeSectionService } from './desktop-runtime-section.service';

/** Overlay 运行时。 */
@Injectable({ providedIn: 'root' })
export class DesktopOverlayRuntimeService extends DesktopRuntimeSectionService {
  readonly source = SCRIPT_12_OVERLAYS;
}
