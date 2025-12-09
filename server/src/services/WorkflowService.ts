import { defaultNodeRegistry } from '../workflows/NodeRegistry.js';
import { AutoNodeGenerator } from '../workflows/AutoNodeGenerator.js';
import { WorkflowCompilerService } from '../workflows/WorkflowCompilerService.js';
import { WorkflowStorage } from '../workflows/WorkflowStorage.js';
import { WorkflowEngine } from '../workflows/WorkflowEngine.js';

// Centralizes workflow-related singletons for reuse across routes and services.
const registry = defaultNodeRegistry;
const generator = new AutoNodeGenerator(registry);
const storage = new WorkflowStorage();
const compiler = new WorkflowCompilerService(registry, generator);
const engine = new WorkflowEngine(registry, storage);

export const workflowServices = {
  registry,
  generator,
  storage,
  compiler,
  engine,
};
