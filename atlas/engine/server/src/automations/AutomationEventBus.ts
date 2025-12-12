import { EventEmitter } from 'node:events';
import type { AutomationEdge, AutomationNode, AutomationPipeline, DrawerEventPayload } from './types.js';

type PipelineEvent = {
  sessionId: string;
  pipeline: AutomationPipeline;
};

type NodeEvent = {
  sessionId: string;
  node: AutomationNode;
};

type EdgeEvent = {
  sessionId: string;
  edge: AutomationEdge;
};

type StatusEvent = {
  sessionId: string;
  status: string;
  detail?: Record<string, unknown>;
};

type AutomationEventName = 'drawer' | 'pipeline' | 'node' | 'edge' | 'status';

type AutomationEventPayloads = {
  drawer: DrawerEventPayload;
  pipeline: PipelineEvent;
  node: NodeEvent;
  edge: EdgeEvent;
  status: StatusEvent;
};

export class AutomationEventBus extends EventEmitter {
  emitDrawer(payload: DrawerEventPayload) {
    this.emit('drawer', payload as DrawerEventPayload);
  }

  onDrawer(listener: (payload: DrawerEventPayload) => void) {
    this.on('drawer', listener);
    return () => this.off('drawer', listener);
  }

  emitPipeline(payload: PipelineEvent) {
    this.emit('pipeline', payload as PipelineEvent);
  }

  onPipeline(listener: (payload: PipelineEvent) => void) {
    this.on('pipeline', listener);
    return () => this.off('pipeline', listener);
  }

  emitNode(payload: NodeEvent) {
    this.emit('node', payload as NodeEvent);
  }

  onNode(listener: (payload: NodeEvent) => void) {
    this.on('node', listener);
    return () => this.off('node', listener);
  }

  emitEdge(payload: EdgeEvent) {
    this.emit('edge', payload as EdgeEvent);
  }

  onEdge(listener: (payload: EdgeEvent) => void) {
    this.on('edge', listener);
    return () => this.off('edge', listener);
  }

  emitStatus(payload: StatusEvent) {
    this.emit('status', payload as StatusEvent);
  }

  onStatus(listener: (payload: StatusEvent) => void) {
    this.on('status', listener);
    return () => this.off('status', listener);
  }

  override emit(eventName: AutomationEventName, ...args: unknown[]): boolean {
    return super.emit(eventName, ...args);
  }
}
