import { google, gmail_v1 } from 'googleapis';

export interface GmailClientConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  redirectUri?: string;
  label?: string;
}

export interface GmailMessage {
  to: string;
  subject: string;
  body: string;
  from?: string;
}

export class GmailClient {
  private readonly gmail: gmail_v1.Gmail;
  private readonly label?: string;

  constructor(config: GmailClientConfig) {
    const oauth2Client = new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
    oauth2Client.setCredentials({ refresh_token: config.refreshToken });
    this.gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    this.label = config.label;
  }

  async listMessages(limit = 5) {
    const response = await this.gmail.users.messages.list({
      userId: 'me',
      maxResults: limit,
      labelIds: this.label ? [this.label] : undefined,
    });
    return response.data.messages ?? [];
  }

  async sendMessage(message: GmailMessage) {
    const raw = this.encodeMessage(message);
    await this.gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw,
      },
    });
  }

  private encodeMessage(message: GmailMessage) {
    const headers = [
      `To: ${message.to}`,
      `Subject: ${message.subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset="UTF-8"`,
      message.from ? `From: ${message.from}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    const data = `${headers}\n\n${message.body}`;
    return Buffer.from(data).toString('base64url');
  }
}

export function createGmailClientFromConfig(values: Record<string, unknown>): GmailClient {
  const clientId = typeof values.clientId === 'string' ? values.clientId : '';
  const clientSecret = typeof values.clientSecret === 'string' ? values.clientSecret : '';
  const refreshToken = typeof values.refreshToken === 'string' ? values.refreshToken : '';
  const redirectUri = typeof values.redirectUri === 'string' ? values.redirectUri : undefined;
  const label = typeof values.label === 'string' ? values.label : undefined;
  return new GmailClient({ clientId, clientSecret, refreshToken, redirectUri, label });
}

