import { google } from 'googleapis';
export class GmailClient {
    constructor(config) {
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
    async sendMessage(message) {
        const raw = this.encodeMessage(message);
        await this.gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw,
            },
        });
    }
    encodeMessage(message) {
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
export function createGmailClientFromConfig(values) {
    const clientId = typeof values.clientId === 'string' ? values.clientId : '';
    const clientSecret = typeof values.clientSecret === 'string' ? values.clientSecret : '';
    const refreshToken = typeof values.refreshToken === 'string' ? values.refreshToken : '';
    const redirectUri = typeof values.redirectUri === 'string' ? values.redirectUri : undefined;
    const label = typeof values.label === 'string' ? values.label : undefined;
    return new GmailClient({ clientId, clientSecret, refreshToken, redirectUri, label });
}
