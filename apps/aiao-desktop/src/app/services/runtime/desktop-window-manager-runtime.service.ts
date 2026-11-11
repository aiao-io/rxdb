import { Injectable } from '@angular/core';

import { SCRIPT_06_WINDOW_MANAGER } from '../../runtime/06-window-manager';

import { DesktopRuntimeSectionService } from './desktop-runtime-section.service';

/** WindowManager 运行时。 */
@Injectable({ providedIn: 'root' })
export class DesktopWindowManagerRuntimeService extends DesktopRuntimeSectionService {
  readonly source = SCRIPT_06_WINDOW_MANAGER;
}
