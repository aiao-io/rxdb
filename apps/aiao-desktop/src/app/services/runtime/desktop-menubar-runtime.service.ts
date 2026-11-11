import { Injectable } from '@angular/core';

import { SCRIPT_03_MENUBAR } from '../../runtime/03-menubar';

import { DesktopRuntimeSectionService } from './desktop-runtime-section.service';

/** Menubar 运行时。 */
@Injectable({ providedIn: 'root' })
export class DesktopMenubarRuntimeService extends DesktopRuntimeSectionService {
  readonly source = SCRIPT_03_MENUBAR;
}
