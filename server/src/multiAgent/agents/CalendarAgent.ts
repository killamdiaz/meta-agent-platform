import type { AgentMessage } from '../MessageBroker.js';
import { AtlasModuleAgent, type AtlasModuleAgentOptions } from './AtlasModuleAgent.js';

const CREATE_MEET_LINK = '/create-atlas-meet-link';
const GENERATE_LIVEKIT_TOKEN = '/generate-livekit-token';

interface MeetingPayload {
  title?: string;
  agenda?: string;
  participants?: string[];
  when?: string;
}

export interface CalendarAgentOptions extends Omit<AtlasModuleAgentOptions, 'endpoints'> {}

export class CalendarAgent extends AtlasModuleAgent {
  private readonly pendingMeetings = new Map<string, { payload: MeetingPayload; requester: string }>();

  constructor(options: CalendarAgentOptions) {
    super({
      ...options,
      role: options.role ?? 'Atlas Calendar Agent',
      description:
        options.description ??
        'Manages meetings, generates Atlas meeting links, and coordinates follow-up tasks after sessions.',
      endpoints: [CREATE_MEET_LINK, GENERATE_LIVEKIT_TOKEN, '/bridge-tasks'],
    });
  }

  protected override async handleOperationalMessage(message: AgentMessage): Promise<void> {
    const payload = this.extractMeetingPayload(message);
    const title = payload.title ?? message.content.trim() ?? 'Team Meeting';

    if (!payload.participants || payload.participants.length === 0) {
      this.pendingMeetings.set(message.id, { payload: { ...payload, title }, requester: message.from });
      await this.requestHelp('EmailMonitoringAgent', {
        query: `meeting participants for "${title}"`,
        missing: ['participants'],
        requester: this.id,
        messageId: message.id,
      });
      await this.sendMessage(
        message.from,
        'response',
        'I asked EmailMonitoringAgent to confirm the participant list before scheduling.',
        { intent: 'calendar_pending_participants' },
      );
      return;
    }

    await this.scheduleMeeting(payload, message.from, message.id);
  }

  protected override async handleContextRequest(message: AgentMessage): Promise<void> {
    const payload = this.getMessagePayload<Record<string, unknown>>(message);
    const participant = typeof payload?.participant === 'string' ? payload?.participant : undefined;
    const context = await this.fetchAtlas<Record<string, unknown>>('/bridge-tasks', {
      limit: 5,
      tag: 'meeting',
      participant,
    });
    if (!context) {
      await this.sendMessage(
        message.from,
        'response',
        'Unable to fetch meeting follow-up tasks right now.',
        { intent: 'calendar_context_unavailable' },
      );
      return;
    }
    await this.sendContextResponse(
      message.from,
      context,
      `Meeting follow-ups prepared for ${message.from}.`,
      { responder: this.id },
    );
  }

  protected override async handleContextResponse(message: AgentMessage): Promise<void> {
    const payload = this.getMessagePayload<Record<string, unknown>>(message) ?? {};
    const respondingTo =
      typeof payload.messageId === 'string'
        ? payload.messageId
        : typeof message.metadata?.respondingTo === 'string'
          ? message.metadata.respondingTo
          : undefined;
    if (!respondingTo) {
      return;
    }

    const pending = this.pendingMeetings.get(respondingTo);
    if (!pending) {
      return;
    }

    const participants = Array.isArray(payload.participants)
      ? payload.participants.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : pending.payload.participants;
    if (!participants || participants.length === 0) {
      await this.sendMessage(
        pending.requester,
        'response',
        'Still missing participant details; meeting not scheduled yet.',
        { intent: 'calendar_pending_participants' },
      );
      return;
    }

    this.pendingMeetings.delete(respondingTo);
    await this.scheduleMeeting({ ...pending.payload, participants }, pending.requester, respondingTo);
  }

  private extractMeetingPayload(message: AgentMessage): MeetingPayload {
    const metadata = (message.metadata ?? {}) as Record<string, unknown>;
    const direct = this.coerceMeeting(metadata.meeting);
    if (direct) return direct;
    const payload = this.getMessagePayload<Record<string, unknown>>(message);
    const embedded = this.coerceMeeting(payload?.meeting ?? payload);
    return embedded ?? {};
  }

  private coerceMeeting(source: unknown): MeetingPayload | null {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return null;
    }
    const record = source as Record<string, unknown>;
    const participants = Array.isArray(record.participants)
      ? record.participants.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : undefined;
    return {
      title: typeof record.title === 'string' ? record.title : undefined,
      agenda: typeof record.agenda === 'string' ? record.agenda : undefined,
      participants,
      when: typeof record.when === 'string' ? record.when : undefined,
    };
  }

  private async scheduleMeeting(payload: MeetingPayload, requester: string, sourceMessageId?: string) {
    const title = payload.title ?? 'Team Meeting';
    if (!payload.participants || payload.participants.length === 0) {
      await this.sendMessage(
        requester,
        'response',
        'Participant list still missing; meeting cannot be scheduled.',
        { intent: 'calendar_pending_participants' },
      );
      return;
    }

    const meetLink = await this.postAtlas<{ url?: string; meetingId?: string }>(CREATE_MEET_LINK, {
      title,
      agenda: payload.agenda ?? 'General discussion',
      participants: payload.participants,
      scheduledFor: payload.when ?? null,
    });
    if (!meetLink?.url) {
      await this.sendMessage(
        requester,
        'response',
        'I tried to create an Atlas meeting link but the bridge is unavailable.',
        { intent: 'calendar_creation_failed' },
      );
      return;
    }

    const livekitToken = await this.postAtlas<{ token?: string }>(GENERATE_LIVEKIT_TOKEN, {
      meetingUrl: meetLink.url,
      participants: payload.participants,
    });

    await this.sendMessage(
      requester,
      'response',
      `Meeting scheduled!\nLink: ${meetLink.url}\nLiveKit token issued: ${Boolean(livekitToken?.token)}`,
      {
        intent: 'calendar_meeting_created',
        payload: {
          meeting: meetLink,
          livekit: livekitToken,
        },
      },
    );

    await this.notifyAtlas('calendar_event', 'Meeting Scheduled', `Meeting "${title}" scheduled by ${this.name}`, {
      meeting: meetLink,
      agenda: payload.agenda,
      participants: payload.participants,
      requestedBy: requester,
      sourceMessage: sourceMessageId,
    });
  }
}
