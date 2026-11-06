import { startService } from '@rp-gant/service-kit';
import { buildApp } from './app.js';

const app = buildApp();
await startService(app);
