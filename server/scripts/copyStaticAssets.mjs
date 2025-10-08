import { mkdir, copyFile } from 'fs/promises';
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

copyPermissionsFile().catch((error) => {
  console.error('Failed to copy static assets', error);
  process.exit(1);
});
