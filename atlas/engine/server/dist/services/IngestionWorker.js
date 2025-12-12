import { pool } from '../db.js';
import { crawlSite } from './PlaywrightCrawler.js';
import { storeEmbeddings } from '../core/ingestion/index.js';
import { config } from '../config.js';
const POLL_INTERVAL_MS = Number(process.env.INGESTION_POLL_MS ?? 15000);
async function fetchNextQueuedJob() {
    const { rows } = await pool.query(`SELECT * FROM import_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`);
    return rows[0] ?? null;
}
async function updateJobStatus(id, status, progress, metadata, counts) {
    const parts = ['status = $2', 'progress = $3', "metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb"];
    const values = [id, status, progress, JSON.stringify(metadata ?? {})];
    if (counts?.processed !== undefined) {
        parts.push(`processed_records = $${values.length + 1}`);
        values.push(counts.processed);
    }
    if (counts?.total !== undefined) {
        parts.push(`total_records = $${values.length + 1}`);
        values.push(Math.max(1, counts.total ?? 1));
    }
    const setClause = parts.join(', ');
    await pool.query(`UPDATE import_jobs SET ${setClause} WHERE id = $1`, values);
}
async function processJob(job) {
    if (!job.source) {
        await updateJobStatus(job.id, 'failed', 0, { reason: 'missing_source' });
        return;
    }
    console.log(`[ingestion-worker] processing job ${job.id} source=${job.source}`);
    await updateJobStatus(job.id, 'processing', 5, undefined, { processed: 0, total: 1 });
    try {
        const additional = (config.crawlAdditionalPaths ?? '')
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean);
        let discovered = 0;
        const pages = await crawlSite(job.source, additional, config.crawlMaxPages ?? 50, async (currentUrl) => {
            await updateJobStatus(job.id, 'processing', 25, { current_url: currentUrl });
        }, async (stats) => {
            discovered = Math.max(discovered, stats.discovered, stats.visited + stats.queued);
            await updateJobStatus(job.id, 'processing', 10, {
                current_url: job.source,
                total_records: discovered,
                processed_records: 0,
            }, { processed: 0, total: discovered });
        });
        const totalPages = pages.length;
        const totalEstimated = discovered || totalPages || 1;
        console.log(`[ingestion-worker] crawl finished for job ${job.id} source=${job.source} discovered=${discovered} pages=${totalPages}`);
        await updateJobStatus(job.id, 'processing', totalPages === 0 ? 10 : Math.min(30, Math.floor((0 / totalEstimated) * 90) + 10), {
            current_url: job.source,
            total_records: totalEstimated,
            processed_records: 0,
        }, { processed: 0, total: totalEstimated });
        let processed = 0;
        for (const page of pages) {
            const totalForProgress = discovered || totalPages || 1;
            const computedProgress = Math.min(95, Math.floor(((processed + 1) / totalForProgress) * 90) + 10);
            console.log(`[ingestion-worker] job=${job.id} page ${processed + 1}/${totalForProgress} url=${page.url}`);
            await updateJobStatus(job.id, 'processing', computedProgress, {
                current_url: page.url,
                total_records: totalForProgress,
                processed_records: processed + 1,
            }, { processed: processed + 1, total: totalForProgress });
            await storeEmbeddings([
                {
                    orgId: job.org_id ?? '',
                    accountId: job.account_id ?? undefined,
                    sourceType: 'crawler',
                    sourceId: page.url,
                    content: page.content,
                    metadata: { import_job_id: job.id, title: page.title, source_url: page.url },
                    visibilityScope: 'org',
                },
            ]);
            processed += 1;
        }
        await updateJobStatus(job.id, 'completed', 100, {
            pages: totalPages,
            total_records: discovered || totalPages,
            processed_records: processed,
        }, { processed, total: discovered || totalPages });
        console.log(`[ingestion-worker] completed job ${job.id} pages=${totalPages}`);
    }
    catch (error) {
        console.error(`[ingestion-worker] failed job ${job.id}`, error);
        await updateJobStatus(job.id, 'failed', 0, { error: error.message });
    }
}
export async function startIngestionWorker() {
    console.log(`[ingestion-worker] starting poller interval=${POLL_INTERVAL_MS}ms`);
    try {
        const res = await pool.query(`UPDATE import_jobs
          SET status = 'queued', progress = 0
        WHERE status = 'processing'`);
        console.log(`[ingestion-worker] reset ${res.rowCount ?? 0} in-progress jobs to queued`);
    }
    catch (error) {
        console.error('[ingestion-worker] failed to reset stale jobs', error);
    }
    const loop = async () => {
        try {
            const job = await fetchNextQueuedJob();
            if (job) {
                await processJob(job);
            }
        }
        catch (error) {
            console.error('[ingestion-worker] loop error', error);
        }
        finally {
            setTimeout(loop, POLL_INTERVAL_MS);
        }
    };
    loop();
}
