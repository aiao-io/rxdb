import { createApp } from './bootstrap';
import { config } from './config';

const app = await createApp();
app.get('/health', () => ({ ok: true })).listen({ port: config.PORT, hostname: '0.0.0.0' });
console.log(`Model Design API listening on port ${config.PORT}`);
