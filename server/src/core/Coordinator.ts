import { agentManager } from './AgentManager.js';
import { config } from '../config.js';

export class Coordinator {
  private timer?: NodeJS.Timeout;

  start() {
    this.stop();
    this.timer = setInterval(() => {
      this.tick().catch((error) => {
        console.error('[coordinator] tick failed', error);
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
