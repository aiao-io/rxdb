import { Injectable } from '@angular/core';

import { SCRIPT_08_APPS2 } from '../../runtime/08-apps2';

import { DesktopRuntimeSectionService } from './desktop-runtime-section.service';

/** TerminalCalculator 运行时。 */
@Injectable({ providedIn: 'root' })
export class DesktopTerminalCalculatorRuntimeService extends DesktopRuntimeSectionService {
  readonly source = SCRIPT_08_APPS2;
}
