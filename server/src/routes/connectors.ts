import { Router } from 'express';
import { buildSlackApiRouter } from '../connectors/slack/api/index.js';
import { buildJiraApiRouter } from '../connectors/jira/api/index.js';

const router = Router();
const slackRouter = buildSlackApiRouter();
const jiraRouter = buildJiraApiRouter();

router.use('/slack', slackRouter);
router.use('/slack/api', slackRouter);
router.use('/jira', jiraRouter);
router.use('/jira/api', jiraRouter);

export default router;
