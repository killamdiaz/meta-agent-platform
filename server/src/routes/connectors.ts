import { Router } from 'express';
import { buildSlackApiRouter } from '../connectors/slack/api/index.js';

const router = Router();
const slackRouter = buildSlackApiRouter();

router.use('/slack', slackRouter);
router.use('/slack/api', slackRouter);

export default router;
