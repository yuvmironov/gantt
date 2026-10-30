import { startService } from '@smart-oati/service-kit';
import { buildApp } from './app.js';

const app = buildApp();
await startService(app);
