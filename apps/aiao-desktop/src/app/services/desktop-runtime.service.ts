import { Injectable, inject, signal } from '@angular/core';

import { DesktopRuntimeExecutorService } from './runtime/desktop-runtime-executor.service';
import { DesktopRuntimeSectionsService } from './runtime/desktop-runtime-sections.service';
import { DesktopTerminalRuntimeService } from './desktop-terminal-runtime.service';

/** 桌面运行时的唯一编排入口。具体领域由独立服务提供。 */
@Injectable({ providedIn: 'root' })
export class DesktopRuntimeService {
  private readonly executor = inject(DesktopRuntimeExecutorService);
  private readonly sections = inject(DesktopRuntimeSectionsService);
  private readonly terminal = inject(DesktopTerminalRuntimeService);
  private readonly startedState = signal(false);

  readonly started = this.startedState.asReadonly();

  start(): void {
    if (this.startedState()) return;

    this.terminal.install();
    this.executor.execute(this.sections.sources());
    this.startedState.set(true);
  }
}
