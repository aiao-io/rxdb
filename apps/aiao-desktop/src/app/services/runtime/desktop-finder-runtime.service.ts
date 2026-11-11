import { Injectable } from '@angular/core';

import { SCRIPT_07_APPS } from '../../runtime/07-apps';

import { DesktopRuntimeSectionService } from './desktop-runtime-section.service';

/** Finder 运行时。 */
@Injectable({ providedIn: 'root' })
export class DesktopFinderRuntimeService extends DesktopRuntimeSectionService {
  readonly source = SCRIPT_07_APPS;
}
