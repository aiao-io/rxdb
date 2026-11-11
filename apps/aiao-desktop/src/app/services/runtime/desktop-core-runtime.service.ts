import { Injectable } from '@angular/core';

import { SCRIPT_02_CORE } from '../../runtime/02-core';

import { DesktopRuntimeSectionService } from './desktop-runtime-section.service';

/** Core 运行时。 */
@Injectable({ providedIn: 'root' })
export class DesktopCoreRuntimeService extends DesktopRuntimeSectionService {
  readonly source = SCRIPT_02_CORE;
}
