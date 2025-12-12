import { mkdir, copyFile, cp, access } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function copyPermissionsFile() {
  const projectRoot = path.resolve(__dirname, '..');
  const source = path.join(projectRoot, 'src', 'config', 'permissions.yaml');
  const destinationDir = path.join(projectRoot, 'dist', 'config');
  const destination = path.join(destinationDir, 'permissions.yaml');

  await mkdir(destinationDir, { recursive: true });
  await copyFile(source, destination);
  console.log(`Copied permissions.yaml to ${destination}`);
}

async function copyUiBuild() {
  const projectRoot = path.resolve(__dirname, '..');
  const uiDist = path.resolve(projectRoot, '..', 'meta-agent-platform-ui', 'dist');
  const destination = path.join(projectRoot, 'dist', 'public');

  try {
    await access(uiDist);
  } catch {
    console.warn('UI build output not found, skipping static asset copy');
    return;
  }

  await mkdir(destination, { recursive: true });
  await cp(uiDist, destination, { recursive: true });
  console.log(`Copied UI build assets to ${destination}`);
}

Promise.all([copyPermissionsFile(), copyUiBuild()]).catch((error) => {
  console.error('Failed to copy static assets', error);
  process.exit(1);
});
