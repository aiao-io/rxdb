import { Injectable } from '@angular/core';

import { SCRIPT_11_APPS5 } from '../../runtime/11-apps5';

import { DesktopRuntimeSectionService } from './desktop-runtime-section.service';

/** CommunicationMedia 运行时。 */
@Injectable({ providedIn: 'root' })
export class DesktopCommunicationMediaRuntimeService extends DesktopRuntimeSectionService {
  readonly source = SCRIPT_11_APPS5;
}
