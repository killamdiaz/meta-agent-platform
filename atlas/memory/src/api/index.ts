import { Router, type Request, type Response } from 'express';

const router = Router();

router.post('/memory/ingest', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'ingest placeholder' });
});

router.post('/memory/query', (_req: Request, res: Response) => {
  res.json({ data: [], message: 'query placeholder' });
});

export default router;
