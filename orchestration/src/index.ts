import express from 'express';
import { config } from 'dotenv';

config();

const app = express();
const PORT = process.env.PORT || 12064;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'ultima-epoch-orchestration',
    version: '0.1.0',
    agent: 'MAX',
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`[MAX] Neural Mesh Orchestration online — port ${PORT}`);
});

export default app;
