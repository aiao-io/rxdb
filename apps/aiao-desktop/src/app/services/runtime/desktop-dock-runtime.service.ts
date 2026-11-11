import { Injectable } from '@angular/core';

import { SCRIPT_05_DOCK } from '../../runtime/05-dock';

import { DesktopRuntimeSectionService } from './desktop-runtime-section.service';

/** Dock 运行时。 */
@Injectable({ providedIn: 'root' })
export class DesktopDockRuntimeService extends DesktopRuntimeSectionService {
  readonly source = SCRIPT_05_DOCK;
}
