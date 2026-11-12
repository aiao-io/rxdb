import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AiDrawerComponent } from './adapters/ai-drawer.component';
import { AiDrawerService } from './adapters/ai-drawer.service';

@Component({
  imports: [RouterOutlet, AiDrawerComponent],
  selector: 'aiao-root',
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  readonly drawer = inject(AiDrawerService);
}
