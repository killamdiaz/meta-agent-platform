export class AgentRegistry {
    constructor(broker) {
        this.broker = broker;
        this.agents = new Map();
        this.routeMessage = (message) => {
            if (message.to === '*' || message.to === 'broadcast') {
                this.broadcast(message);
                return;
            }
            const recipients = new Map();
            const directRecipient = this.agents.get(message.to);
            if (directRecipient) {
                recipients.set(directRecipient.id, directRecipient);
            }
            for (const subscriberId of this.broker.resolveSubscribers(message.to)) {
                if (subscriberId === message.from) {
                    continue;
                }
                const subscriber = this.agents.get(subscriberId);
                if (subscriber) {
                    recipients.set(subscriber.id, subscriber);
                }
            }
            if (recipients.size === 0) {
                this.broker.emitStateChange({
                    agentId: message.to,
                    message,
                    direction: 'incoming',
                });
                return;
            }
            for (const agent of recipients.values()) {
                agent.receiveMessage({ ...message, to: agent.id });
            }
        };
        this.broker.onMessage(this.routeMessage);
    }
    register(agent) {
        if (this.agents.has(agent.id)) {
            throw new Error(`Agent with id "${agent.id}" is already registered.`);
        }
        this.agents.set(agent.id, agent);
        this.broker.registerAgent({
            id: agent.id,
            name: agent.name,
            role: agent.role,
            connections: agent.connections,
        });
    }
    unregister(agentId) {
        const agent = this.agents.get(agentId);
        if (!agent)
            return;
        agent.dispose?.();
        this.agents.delete(agentId);
        this.broker.unregisterAgent(agentId);
    }
    get(agentId) {
        return this.agents.get(agentId);
    }
    has(agentId) {
        return this.agents.has(agentId);
    }
    list() {
        return Array.from(this.agents.values());
    }
    sendMessage(from, to, type, content, metadata) {
        return this.broker.publish({ from, to, type, content, metadata });
    }
    broadcast(message) {
        for (const [id, agent] of this.agents.entries()) {
            if (id === message.from)
                continue;
            agent.receiveMessage({ ...message, to: id });
        }
    }
}
