import { mkdirSync } from 'node:fs';
import { buildApp } from './app.js';
import { getListenConfig } from './listen-config.js';

mkdirSync('data/uploads', { recursive: true });
const app = await buildApp({ logger: true });
await app.listen(getListenConfig());
