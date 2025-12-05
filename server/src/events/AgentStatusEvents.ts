import { EventEmitter } from 'events';

type StatusPayload = { label: string; stage?: string };

class AgentStatusEmitter extends EventEmitter {
  emitUpdate(payload: StatusPayload) {
    this.emit('status:update', payload);
  }
}

export const AgentStatusEvents = new AgentStatusEmitter();
