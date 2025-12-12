import express from 'express';
import apiRouter from './api/index.js';

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 5001;

app.use(express.json());
app.use(apiRouter);

app.listen(port, () => {
  console.log(`[memory] service listening on ${port}`);
});
