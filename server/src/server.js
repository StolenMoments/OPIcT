import { mkdirSync } from 'node:fs';
import { buildApp } from './app.js';

mkdirSync('data/uploads', { recursive: true });
const app = await buildApp({ logger: true });
await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
