import { agentManager } from './AgentManager.js';
import { config } from '../config.js';
import { metaController } from './MetaController.js';

export class Coordinator {
  private timer?: NodeJS.Timeout;
  private ticking = false;

  start() {
    this.stop();
    this.timer = setInterval(() => {
      if (this.ticking) {
        return;
      }
      this.ticking = true;
      this.tick()
        .catch((error) => {
          console.error('[coordinator] tick failed', error);
        })
        .finally(() => {
          this.ticking = false;
        });
    }, config.coordinatorIntervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async tick() {
    await metaController.tick();
    const pending = await agentManager.fetchPendingTasks();
    for (const task of pending) {
      try {
        await agentManager.handleTask(task);
      } catch (error) {
        console.error(`[coordinator] task ${task.id} failed`, error);
      }
    }
  }
}

export const coordinator = new Coordinator();
