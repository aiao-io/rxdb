import { Component } from '@angular/core';
import { AdminConsole } from './admin-console';
import { ProductClient } from './product-client';

@Component({
  imports: [AdminConsole],
  selector: 'aiao-media-admin-root',
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  readonly client = new ProductClient(async () => {
    throw new Error('后台账号验证尚未配置。');
  });
  readonly identity = '';
  readonly status = 'signed-out';
}
