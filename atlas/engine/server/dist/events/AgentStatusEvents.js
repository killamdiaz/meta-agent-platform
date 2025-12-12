import { EventEmitter } from 'events';
class AgentStatusEmitter extends EventEmitter {
    emitUpdate(payload) {
        this.emit('status:update', payload);
    }
}
export const AgentStatusEvents = new AgentStatusEmitter();
