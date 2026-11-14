import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BomWorkspaceState } from '../bom-workspace-state';

/** 可退出的业务路线与普通工作台共用条件和页面。 */
@Component({
  selector: 'bom-workflow-journey',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (workspace.guideStep() > 0) {
      <nav class="workflow-journey" aria-label="业务体验路线">
        <span>跟着一份生产计划体验</span>
        @for (step of steps; track step.path) {
          <a
            [attr.aria-current]="workspace.guideStep() === step.number ? 'step' : null"
            [queryParams]="stepParams(step.number)"
            [routerLink]="step.path"
            >{{ step.number }}. {{ step.label }}</a
          >
        }
        <button class="btn btn-quiet" (click)="workspace.guideStep.set(0)">退出引导，继续工作</button>
      </nav>
    }
  `,
  styles: `
    .workflow-journey {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin: 20px 32px 0;
      padding: 14px 18px;
      background: var(--color-primary-bg);
      border-radius: 8px;
      font-size: 13px;
    }
    a {
      color: var(--color-primary);
      padding: 6px;
    }
    a[aria-current] {
      font-weight: 650;
      text-decoration: underline;
    }
    @media (max-width: 600px) {
      .workflow-journey {
        margin: 16px;
      }
    }
  `
})
export class WorkflowJourney {
  readonly workspace = inject(BomWorkspaceState);
  readonly steps = [
    { number: 1, path: '/explosion', label: '看清物料需求' },
    { number: 2, path: '/cost', label: '了解成本来源' },
    { number: 3, path: '/where-used', label: '追踪使用影响' }
  ];

  stepParams(step: number): Record<string, string> {
    return { ...this.workspace.queryParams(), guide: String(step) };
  }
}
