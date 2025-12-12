import { Router } from 'express';
import { readFileSync } from 'fs';
import path from 'path';
const router = Router();
function getPackageVersion() {
    try {
        const pkg = JSON.parse(readFileSync(path.resolve(process.cwd(), 'server/package.json'), 'utf8'));
        return pkg.version;
    }
    catch {
        return '0.0.0';
    }
}
router.get('/version', (_req, res) => {
    const currentVersion = process.env.CURRENT_VERSION || getPackageVersion();
    const latestVersion = process.env.LATEST_VERSION || currentVersion;
    const changelogUrl = process.env.CHANGELOG_URL || 'https://atlasos.app/releases';
    res.json({
        currentVersion,
        latestVersion,
        changelogUrl,
    });
});
export default router;
