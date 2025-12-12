const resolveExport = (namespace, exportName) => {
    if (!namespace) {
        return undefined;
    }
    if (!exportName || exportName === 'default') {
        return namespace.default ?? namespace;
    }
    const record = namespace;
    if (record[exportName] !== undefined) {
        return record[exportName];
    }
    const defaultExport = record.default;
    return defaultExport ? defaultExport[exportName] : undefined;
};
const instantiateClass = (exportName, argsFn = () => []) => {
    return (namespace, credentials) => {
        const Ctor = resolveExport(namespace, exportName);
        if (typeof Ctor !== 'function') {
            return null;
        }
        const args = argsFn(credentials);
        return new Ctor(...args);
    };
};
const invokeFactory = (exportName, argsFn) => {
    return (namespace, credentials) => {
        const factory = resolveExport(namespace, exportName);
        if (typeof factory !== 'function') {
            return null;
        }
        const args = argsFn(credentials);
        return factory(...args);
    };
};
const createAxiosClient = (options) => {
    return (namespace, credentials) => {
        const axios = resolveExport(namespace, 'default');
        if (!axios || typeof axios.create !== 'function') {
            return null;
        }
        const configuredBase = typeof options.baseURL === 'function' ? options.baseURL(credentials) : options.baseURL;
        const baseURL = options.baseURLEnv && credentials[options.baseURLEnv]
            ? credentials[options.baseURLEnv]
            : configuredBase ?? undefined;
        const headers = options.headers ? options.headers(credentials) : undefined;
        const params = options.params ? options.params(credentials) : undefined;
        return axios.create({
            baseURL,
            headers,
            params,
        });
    };
};
export const CLIENT_BINDINGS = {
    slack: {
        label: 'Slack',
        module: '@slack/web-api',
        env: ['SLACK_BOT_TOKEN'],
        builder: instantiateClass('WebClient', (creds) => [creds.SLACK_BOT_TOKEN]),
        aliases: ['slackbot', 'slack-bot'],
        configKeys: {
            SLACK_BOT_TOKEN: ['slackBotToken', 'botToken', 'token'],
        },
    },
    discord: {
        label: 'Discord',
        module: 'discord.js',
        env: ['DISCORD_BOT_TOKEN|DISCORD_TOKEN|BOT_TOKEN'],
        builder: async (namespace, credentials) => {
            const Client = resolveExport(namespace, 'Client');
            if (Client) {
                const gatewayIntents = resolveExport(namespace, 'GatewayIntentBits');
                const intents = gatewayIntents ? [gatewayIntents.Guilds ?? 0] : [];
                const client = new Client({ intents });
                client._token = credentials.DISCORD_BOT_TOKEN;
                return client;
            }
            const baseUrl = 'https://discord.com/api/v10';
            const token = credentials.DISCORD_BOT_TOKEN;
            const fetchFn = globalThis.fetch;
            if (!fetchFn) {
                throw new Error('Global fetch is not available to create Discord REST client');
            }
            const request = async (path, init = {}) => {
                const headers = {
                    Authorization: `Bot ${token}`,
                    ...(init.headers ?? {}),
                };
                if (init.body && !headers['Content-Type']) {
                    headers['Content-Type'] = 'application/json';
                }
                const response = await fetchFn(`${baseUrl}${path}`, {
                    ...init,
                    headers,
                });
                if (!response.ok) {
                    const errorBody = await response.text();
                    throw new Error(`Discord REST ${response.status}: ${errorBody}`);
                }
                try {
                    return (await response.json());
                }
                catch {
                    return undefined;
                }
            };
            return {
                request,
                sendMessage: (channelId, payload) => {
                    const body = typeof payload === 'string'
                        ? JSON.stringify({ content: payload })
                        : JSON.stringify({ content: '', ...payload });
                    return request(`/channels/${channelId}/messages`, {
                        method: 'POST',
                        body,
                        headers: { 'Content-Type': 'application/json' },
                    });
                },
            };
        },
        aliases: ['discordbot', 'discord-bot'],
        configKeys: {
            DISCORD_BOT_TOKEN: ['discordBotToken', 'botToken', 'token'],
        },
    },
    teams: {
        label: 'Microsoft Teams',
        module: 'axios',
        env: ['MS_GRAPH_TOKEN'],
        builder: createAxiosClient({
            baseURL: 'https://graph.microsoft.com/v1.0',
            headers: (creds) => ({
                Authorization: `Bearer ${creds.MS_GRAPH_TOKEN}`,
            }),
        }),
        aliases: ['msteams', 'microsoft teams'],
    },
    intercom: {
        label: 'Intercom',
        module: 'axios',
        env: ['INTERCOM_ACCESS_TOKEN'],
        builder: createAxiosClient({
            baseURL: 'https://api.intercom.io',
            headers: (creds) => ({
                Authorization: `Bearer ${creds.INTERCOM_ACCESS_TOKEN}`,
            }),
        }),
    },
    zendesk: {
        label: 'Zendesk',
        module: 'axios',
        env: ['ZENDESK_SUBDOMAIN', 'ZENDESK_EMAIL', 'ZENDESK_API_TOKEN'],
        builder: createAxiosClient({
            baseURL: (creds) => `https://${creds.ZENDESK_SUBDOMAIN}.zendesk.com/api/v2`,
            headers: (creds) => ({
                Authorization: `Basic ${Buffer.from(`${creds.ZENDESK_EMAIL}/token:${creds.ZENDESK_API_TOKEN}`).toString('base64')}`,
            }),
        }),
    },
    twilio: {
        label: 'Twilio',
        module: 'twilio',
        env: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
        builder: invokeFactory(undefined, (creds) => [creds.TWILIO_ACCOUNT_SID, creds.TWILIO_AUTH_TOKEN]),
        aliases: ['whatsapp', 'sms'],
    },
    telegram: {
        label: 'Telegram',
        module: 'node-telegram-bot-api',
        env: ['TELEGRAM_BOT_TOKEN'],
        builder: instantiateClass('default', (creds) => [creds.TELEGRAM_BOT_TOKEN, { polling: false }]),
    },
    mattermost: {
        label: 'Mattermost',
        module: 'axios',
        env: ['MATTERMOST_BASE_URL', 'MATTERMOST_TOKEN'],
        builder: createAxiosClient({
            baseURLEnv: 'MATTERMOST_BASE_URL',
            headers: (creds) => ({
                Authorization: `Bearer ${creds.MATTERMOST_TOKEN}`,
            }),
        }),
    },
    notion: {
        label: 'Notion',
        module: '@notionhq/client',
        env: ['NOTION_API_KEY'],
        builder: instantiateClass('Client', (creds) => [{ auth: creds.NOTION_API_KEY }]),
    },
    asana: {
        label: 'Asana',
        module: 'asana',
        env: ['ASANA_ACCESS_TOKEN'],
        builder: instantiateClass('Client', (creds) => [{ accessToken: creds.ASANA_ACCESS_TOKEN }]),
    },
    trello: {
        label: 'Trello',
        module: 'trello',
        env: ['TRELLO_KEY', 'TRELLO_TOKEN'],
        builder: instantiateClass('default', (creds) => [creds.TRELLO_KEY, creds.TRELLO_TOKEN]),
    },
    clickup: {
        label: 'ClickUp',
        module: 'axios',
        env: ['CLICKUP_API_TOKEN'],
        builder: createAxiosClient({
            baseURL: 'https://api.clickup.com/api/v2',
            headers: (creds) => ({
                Authorization: creds.CLICKUP_API_TOKEN,
            }),
        }),
    },
    monday: {
        label: 'Monday.com',
        module: 'axios',
        env: ['MONDAY_API_TOKEN'],
        builder: createAxiosClient({
            baseURL: 'https://api.monday.com/v2',
            headers: (creds) => ({
                Authorization: creds.MONDAY_API_TOKEN,
                'Content-Type': 'application/json',
            }),
        }),
    },
    todoist: {
        label: 'Todoist',
        module: '@doist/todoist-api-typescript',
        env: ['TODOIST_API_TOKEN'],
        builder: instantiateClass('TodoistApi', (creds) => [creds.TODOIST_API_TOKEN]),
    },
    linear: {
        label: 'Linear',
        module: '@linear/sdk',
        env: ['LINEAR_API_KEY'],
        builder: instantiateClass('LinearClient', (creds) => [{ accessToken: creds.LINEAR_API_KEY }]),
    },
    jira: {
        label: 'Jira',
        module: 'axios',
        env: ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN'],
        builder: createAxiosClient({
            baseURLEnv: 'JIRA_BASE_URL',
            headers: (creds) => ({
                Authorization: `Basic ${Buffer.from(`${creds.JIRA_EMAIL}:${creds.JIRA_API_TOKEN}`).toString('base64')}`,
                Accept: 'application/json',
            }),
        }),
    },
    basecamp: {
        label: 'Basecamp',
        module: 'axios',
        env: ['BASECAMP_ACCESS_TOKEN'],
        builder: createAxiosClient({
            baseURL: 'https://3.basecampapi.com',
            headers: (creds) => ({
                Authorization: `Bearer ${creds.BASECAMP_ACCESS_TOKEN}`,
            }),
        }),
    },
    googledocs: {
        label: 'Google Docs',
        module: '@googleapis/docs',
        env: ['GOOGLE_DOCS_API_KEY'],
        builder: instantiateClass('Docs', (creds) => [{ auth: creds.GOOGLE_DOCS_API_KEY }]),
        aliases: ['google-docs', 'docs'],
    },
    googledrive: {
        label: 'Google Drive',
        module: '@googleapis/drive',
        env: ['GOOGLE_DRIVE_API_KEY'],
        builder: instantiateClass('Drive', (creds) => [{ auth: creds.GOOGLE_DRIVE_API_KEY }]),
        aliases: ['google-drive', 'drive'],
    },
    dropbox: {
        label: 'Dropbox',
        module: 'dropbox',
        env: ['DROPBOX_ACCESS_TOKEN'],
        builder: instantiateClass('Dropbox', (creds) => [{ accessToken: creds.DROPBOX_ACCESS_TOKEN }]),
    },
    confluence: {
        label: 'Confluence',
        module: 'axios',
        env: ['CONFLUENCE_BASE_URL', 'CONFLUENCE_USER', 'CONFLUENCE_API_TOKEN'],
        builder: createAxiosClient({
            baseURLEnv: 'CONFLUENCE_BASE_URL',
            headers: (creds) => ({
                Authorization: `Basic ${Buffer.from(`${creds.CONFLUENCE_USER}:${creds.CONFLUENCE_API_TOKEN}`).toString('base64')}`,
            }),
        }),
    },
    evernote: {
        label: 'Evernote',
        module: 'axios',
        env: ['EVERNOTE_API_TOKEN'],
        builder: createAxiosClient({
            baseURL: 'https://api.evernote.com',
            headers: (creds) => ({
                Authorization: `Bearer ${creds.EVERNOTE_API_TOKEN}`,
            }),
        }),
    },
    quip: {
        label: 'Quip',
        module: 'axios',
        env: ['QUIP_ACCESS_TOKEN'],
        builder: createAxiosClient({
            baseURL: 'https://platform.quip.com/1',
            headers: (creds) => ({
                Authorization: `Bearer ${creds.QUIP_ACCESS_TOKEN}`,
            }),
        }),
    },
    coda: {
        label: 'Coda',
        module: 'axios',
        env: ['CODA_API_TOKEN'],
        builder: createAxiosClient({
            baseURL: 'https://coda.io/apis/v1',
            headers: (creds) => ({
                Authorization: `Bearer ${creds.CODA_API_TOKEN}`,
            }),
        }),
    },
    github: {
        label: 'GitHub',
        module: '@octokit/rest',
        env: ['GITHUB_TOKEN'],
        builder: instantiateClass('Octokit', (creds) => [{ auth: creds.GITHUB_TOKEN }]),
    },
    gitlab: {
        label: 'GitLab',
        module: 'axios',
        env: ['GITLAB_TOKEN', 'GITLAB_BASE_URL'],
        builder: createAxiosClient({
            baseURLEnv: 'GITLAB_BASE_URL',
            headers: (creds) => ({
                'Private-Token': creds.GITLAB_TOKEN,
            }),
        }),
    },
    bitbucket: {
        label: 'Bitbucket',
        module: 'axios',
        env: ['BITBUCKET_USERNAME', 'BITBUCKET_APP_PASSWORD'],
        builder: createAxiosClient({
            baseURL: 'https://api.bitbucket.org/2.0',
            headers: (creds) => ({
                Authorization: `Basic ${Buffer.from(`${creds.BITBUCKET_USERNAME}:${creds.BITBUCKET_APP_PASSWORD}`).toString('base64')}`,
            }),
        }),
    },
    vercel: {
        label: 'Vercel',
        module: 'axios',
        env: ['VERCEL_TOKEN'],
        builder: createAxiosClient({
            baseURL: 'https://api.vercel.com',
            headers: (creds) => ({
                Authorization: `Bearer ${creds.VERCEL_TOKEN}`,
            }),
        }),
    },
    netlify: {
        label: 'Netlify',
        module: 'axios',
        env: ['NETLIFY_ACCESS_TOKEN'],
        builder: createAxiosClient({
            baseURL: 'https://api.netlify.com/api/v1',
            headers: (creds) => ({
                Authorization: `Bearer ${creds.NETLIFY_ACCESS_TOKEN}`,
            }),
        }),
    },
    hubspot: {
        label: 'HubSpot',
        module: '@hubspot/api-client',
        env: ['HUBSPOT_ACCESS_TOKEN'],
        builder: instantiateClass('Client', (creds) => [{ accessToken: creds.HUBSPOT_ACCESS_TOKEN }]),
    },
    salesforce: {
        label: 'Salesforce',
        module: 'jsforce',
        env: ['SALESFORCE_INSTANCE_URL', 'SALESFORCE_ACCESS_TOKEN'],
        builder: instantiateClass('Connection', (creds) => [{ instanceUrl: creds.SALESFORCE_INSTANCE_URL, accessToken: creds.SALESFORCE_ACCESS_TOKEN }]),
    },
    pipedrive: {
        label: 'Pipedrive',
        module: 'pipedrive',
        env: ['PIPEDRIVE_API_TOKEN'],
        builder: instantiateClass('Client', (creds) => [{ apiToken: creds.PIPEDRIVE_API_TOKEN }]),
    },
    zoho: {
        label: 'Zoho CRM',
        module: 'axios',
        env: ['ZOHO_CRM_ACCESS_TOKEN'],
        builder: createAxiosClient({
            baseURL: 'https://www.zohoapis.com/crm/v2',
            headers: (creds) => ({
                Authorization: `Zoho-oauthtoken ${creds.ZOHO_CRM_ACCESS_TOKEN}`,
            }),
        }),
        aliases: ['zoho-crm'],
    },
    gmail: {
        label: 'Gmail',
        module: 'googleapis',
        env: ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'],
        builder: (namespace, credentials) => {
            const google = resolveExport(namespace, 'google');
            if (!google) {
                return null;
            }
            const auth = resolveExport(google, 'auth');
            const OAuth2 = auth ? auth['OAuth2'] : undefined;
            if (!OAuth2) {
                return null;
            }
            const client = new OAuth2(credentials.GMAIL_CLIENT_ID, credentials.GMAIL_CLIENT_SECRET);
            if (typeof client.setCredentials === 'function') {
                client.setCredentials({
                    refresh_token: credentials.GMAIL_REFRESH_TOKEN,
                });
            }
            return client;
        },
    },
    outlook: {
        label: 'Outlook',
        module: 'axios',
        env: ['OUTLOOK_ACCESS_TOKEN'],
        builder: createAxiosClient({
            baseURL: 'https://graph.microsoft.com/v1.0',
            headers: (creds) => ({
                Authorization: `Bearer ${creds.OUTLOOK_ACCESS_TOKEN}`,
            }),
        }),
    },
    sendgrid: {
        label: 'SendGrid',
        module: '@sendgrid/mail',
        env: ['SENDGRID_API_KEY'],
        builder: (namespace, credentials) => {
            const sendgrid = resolveExport(namespace, 'default');
            if (!sendgrid || typeof sendgrid.setApiKey !== 'function') {
                return null;
            }
            sendgrid.setApiKey(credentials.SENDGRID_API_KEY);
            return sendgrid;
        },
    },
    mailgun: {
        label: 'Mailgun',
        module: 'axios',
        env: ['MAILGUN_API_KEY', 'MAILGUN_DOMAIN'],
        builder: createAxiosClient({
            baseURL: (creds) => `https://api.mailgun.net/v3/${creds.MAILGUN_DOMAIN}`,
            headers: (creds) => ({
                Authorization: `Basic ${Buffer.from(`api:${creds.MAILGUN_API_KEY}`).toString('base64')}`,
            }),
        }),
    },
    postmark: {
        label: 'Postmark',
        module: 'postmark',
        env: ['POSTMARK_SERVER_TOKEN'],
        builder: instantiateClass('ServerClient', (creds) => [creds.POSTMARK_SERVER_TOKEN]),
    },
    aws: {
        label: 'AWS',
        module: '@aws-sdk/client-sts',
        env: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'],
        builder: instantiateClass('STSClient', (creds) => [
            {
                region: creds.AWS_REGION,
                credentials: {
                    accessKeyId: creds.AWS_ACCESS_KEY_ID,
                    secretAccessKey: creds.AWS_SECRET_ACCESS_KEY,
                },
            },
        ]),
    },
    gcp: {
        label: 'Google Cloud Platform',
        module: '@google-cloud/storage',
        env: ['GOOGLE_APPLICATION_CREDENTIALS'],
        builder: instantiateClass('Storage', () => []),
        aliases: ['google-cloud', 'gcs'],
    },
    supabase: {
        label: 'Supabase',
        module: '@supabase/supabase-js',
        env: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
        builder: invokeFactory('createClient', (creds) => [creds.SUPABASE_URL, creds.SUPABASE_SERVICE_ROLE_KEY]),
    },
    firebase: {
        label: 'Firebase',
        module: 'firebase-admin',
        env: ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'],
        builder: (namespace, credentials) => {
            const firebaseAdmin = resolveExport(namespace, 'default');
            if (!firebaseAdmin) {
                return null;
            }
            const apps = firebaseAdmin.apps ?? [];
            if (apps.length > 0) {
                return firebaseAdmin;
            }
            const initializeApp = firebaseAdmin.initializeApp;
            const credential = firebaseAdmin.credential;
            if (!initializeApp || !credential?.cert) {
                return null;
            }
            initializeApp({
                credential: credential.cert({
                    projectId: credentials.FIREBASE_PROJECT_ID,
                    clientEmail: credentials.FIREBASE_CLIENT_EMAIL,
                    privateKey: credentials.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                }),
            });
            return firebaseAdmin;
        },
    },
    render: {
        label: 'Render',
        module: 'axios',
        env: ['RENDER_API_KEY'],
        builder: createAxiosClient({
            baseURL: 'https://api.render.com/v1',
            headers: (creds) => ({
                Authorization: `Bearer ${creds.RENDER_API_KEY}`,
            }),
        }),
    },
    flyio: {
        label: 'Fly.io',
        module: 'axios',
        env: ['FLY_API_TOKEN'],
        builder: createAxiosClient({
            baseURL: 'https://api.fly.io/graphql',
            headers: (creds) => ({
                Authorization: `Bearer ${creds.FLY_API_TOKEN}`,
            }),
        }),
        aliases: ['fly', 'fly-io'],
    },
    mixpanel: {
        label: 'Mixpanel',
        module: 'mixpanel',
        env: ['MIXPANEL_TOKEN'],
        builder: (namespace, credentials) => {
            const mixpanel = resolveExport(namespace, 'default');
            if (!mixpanel || typeof mixpanel.init !== 'function') {
                return null;
            }
            return mixpanel.init(credentials.MIXPANEL_TOKEN);
        },
    },
    amplitude: {
        label: 'Amplitude',
        module: '@amplitude/node',
        env: ['AMPLITUDE_API_KEY'],
        builder: invokeFactory('init', (creds) => [creds.AMPLITUDE_API_KEY]),
    },
    ga: {
        label: 'Google Analytics',
        module: 'axios',
        env: ['GA_MEASUREMENT_ID', 'GA_API_SECRET'],
        builder: createAxiosClient({
            baseURL: 'https://www.google-analytics.com',
            params: (creds) => ({
                measurement_id: creds.GA_MEASUREMENT_ID,
                api_secret: creds.GA_API_SECRET,
            }),
        }),
        aliases: ['google-analytics'],
    },
    posthog: {
        label: 'PostHog',
        module: 'posthog-node',
        env: ['POSTHOG_API_KEY', 'POSTHOG_HOST'],
        builder: instantiateClass('PostHog', (creds) => [creds.POSTHOG_API_KEY, { host: creds.POSTHOG_HOST }]),
    },
    stripe: {
        label: 'Stripe',
        module: 'stripe',
        env: ['STRIPE_SECRET_KEY'],
        builder: instantiateClass('default', (creds) => [creds.STRIPE_SECRET_KEY]),
    },
    paypal: {
        label: 'PayPal',
        module: '@paypal/checkout-server-sdk',
        env: ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'],
        builder: (namespace, credentials) => {
            const core = resolveExport(namespace, 'core');
            if (!core) {
                return null;
            }
            const PayPalEnvironment = resolveExport(core, 'LiveEnvironment');
            if (!PayPalEnvironment) {
                return null;
            }
            const PayPalHttpClient = resolveExport(core, 'PayPalHttpClient');
            if (!PayPalHttpClient) {
                return null;
            }
            const environment = new PayPalEnvironment(credentials.PAYPAL_CLIENT_ID, credentials.PAYPAL_CLIENT_SECRET);
            return new PayPalHttpClient(environment);
        },
    },
    razorpay: {
        label: 'Razorpay',
        module: 'razorpay',
        env: ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'],
        builder: instantiateClass('default', (creds) => [
            {
                key_id: creds.RAZORPAY_KEY_ID,
                key_secret: creds.RAZORPAY_KEY_SECRET,
            },
        ]),
    },
    calendly: {
        label: 'Calendly',
        module: 'axios',
        env: ['CALENDLY_API_KEY'],
        builder: createAxiosClient({
            baseURL: 'https://api.calendly.com',
            headers: (creds) => ({
                Authorization: `Bearer ${creds.CALENDLY_API_KEY}`,
            }),
        }),
    },
    zoom: {
        label: 'Zoom',
        module: 'axios',
        env: ['ZOOM_JWT_TOKEN'],
        builder: createAxiosClient({
            baseURL: 'https://api.zoom.us/v2',
            headers: (creds) => ({
                Authorization: `Bearer ${creds.ZOOM_JWT_TOKEN}`,
            }),
        }),
    },
    meet: {
        label: 'Google Meet',
        module: 'axios',
        env: ['GOOGLE_MEET_API_KEY'],
        builder: createAxiosClient({
            baseURL: 'https://meet.googleapis.com/v1',
            headers: (creds) => ({
                'X-Goog-Api-Key': creds.GOOGLE_MEET_API_KEY,
            }),
        }),
        aliases: ['google-meet'],
    },
    openai: {
        label: 'OpenAI',
        module: 'openai',
        env: ['OPENAI_API_KEY'],
        builder: instantiateClass('OpenAI', (creds) => [{ apiKey: creds.OPENAI_API_KEY }]),
    },
    huggingface: {
        label: 'HuggingFace',
        module: '@huggingface/inference',
        env: ['HUGGINGFACE_API_KEY'],
        builder: instantiateClass('HfInference', (creds) => [creds.HUGGINGFACE_API_KEY]),
        aliases: ['hugging-face'],
    },
    figma: {
        label: 'Figma',
        module: 'axios',
        env: ['FIGMA_API_TOKEN'],
        builder: createAxiosClient({
            baseURL: 'https://api.figma.com/v1',
            headers: (creds) => ({
                'X-Figma-Token': creds.FIGMA_API_TOKEN,
            }),
        }),
    },
};
