import { EventEmitter } from 'node:events';
export class AutomationEventBus extends EventEmitter {
    emitDrawer(payload) {
        this.emit('drawer', payload);
    }
    onDrawer(listener) {
        this.on('drawer', listener);
        return () => this.off('drawer', listener);
    }
    emitPipeline(payload) {
        this.emit('pipeline', payload);
    }
    onPipeline(listener) {
        this.on('pipeline', listener);
        return () => this.off('pipeline', listener);
    }
    emitNode(payload) {
        this.emit('node', payload);
    }
    onNode(listener) {
        this.on('node', listener);
        return () => this.off('node', listener);
    }
    emitEdge(payload) {
        this.emit('edge', payload);
    }
    onEdge(listener) {
        this.on('edge', listener);
        return () => this.off('edge', listener);
    }
    emitStatus(payload) {
        this.emit('status', payload);
    }
    onStatus(listener) {
        this.on('status', listener);
        return () => this.off('status', listener);
    }
    emit(eventName, ...args) {
        return super.emit(eventName, ...args);
    }
}
