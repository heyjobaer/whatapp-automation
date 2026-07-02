import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-infrastructure',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<div class="p-8">Infrastructure (port in progress)</div>',
  styleUrl: './infrastructure.component.css'
})
export class InfrastructureComponent {}
