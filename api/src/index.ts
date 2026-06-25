import 'dotenv/config';
import { openDb } from './db';
import { buildApp } from './server';

const PORT = Number(process.env.API_PORT ?? 8787);
const db = openDb();
const app = await buildApp(db);
app.listen({ port: PORT, host: '0.0.0.0' })
  .then(() => console.log(`api on :${PORT}`))
  .catch((e) => { console.error(e); process.exit(1); });
