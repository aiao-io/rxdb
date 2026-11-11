import { Injectable } from '@angular/core';

import { SCRIPT_09_APPS3 } from '../../runtime/09-apps3';

import { DesktopRuntimeSectionService } from './desktop-runtime-section.service';

/** NotesCalendarSafari 运行时。 */
@Injectable({ providedIn: 'root' })
export class DesktopNotesCalendarSafariRuntimeService extends DesktopRuntimeSectionService {
  readonly source = SCRIPT_09_APPS3;
}
