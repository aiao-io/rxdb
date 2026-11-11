import { Injectable, inject } from '@angular/core';

import { DesktopSquircleRuntimeService } from './desktop-squircle-runtime.service';
import { DesktopCoreRuntimeService } from './desktop-core-runtime.service';
import { DesktopMenubarRuntimeService } from './desktop-menubar-runtime.service';
import { DesktopSurfaceRuntimeService } from './desktop-surface-runtime.service';
import { DesktopDockRuntimeService } from './desktop-dock-runtime.service';
import { DesktopWindowManagerRuntimeService } from './desktop-window-manager-runtime.service';
import { DesktopFinderRuntimeService } from './desktop-finder-runtime.service';
import { DesktopTerminalCalculatorRuntimeService } from './desktop-terminal-calculator-runtime.service';
import { DesktopNotesCalendarSafariRuntimeService } from './desktop-notes-calendar-safari-runtime.service';
import { DesktopMusicSettingsRuntimeService } from './desktop-music-settings-runtime.service';
import { DesktopCommunicationMediaRuntimeService } from './desktop-communication-media-runtime.service';
import { DesktopOverlayRuntimeService } from './desktop-overlay-runtime.service';
import { DesktopStartupRuntimeService } from './desktop-startup-runtime.service';

/** 按依赖顺序聚合桌面运行时区块。 */
@Injectable({ providedIn: 'root' })
export class DesktopRuntimeSectionsService {
  private readonly sections = [
    inject(DesktopSquircleRuntimeService),
    inject(DesktopCoreRuntimeService),
    inject(DesktopMenubarRuntimeService),
    inject(DesktopSurfaceRuntimeService),
    inject(DesktopDockRuntimeService),
    inject(DesktopWindowManagerRuntimeService),
    inject(DesktopFinderRuntimeService),
    inject(DesktopTerminalCalculatorRuntimeService),
    inject(DesktopNotesCalendarSafariRuntimeService),
    inject(DesktopMusicSettingsRuntimeService),
    inject(DesktopCommunicationMediaRuntimeService),
    inject(DesktopOverlayRuntimeService),
    inject(DesktopStartupRuntimeService),
  ] as const;

  sources(): readonly string[] {
    return this.sections.map(section => section.source);
  }
}
