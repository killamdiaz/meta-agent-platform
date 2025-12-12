export const SLACK_TRIGGER_DEFINITIONS = [
  {
    id: 'slack.message',
    description: 'When a message is posted in a Slack channel or DM',
    config: {
      channel: '#updates',
      event: 'channel_message',
    },
  },
  {
    id: 'slack.mention',
    description: 'When the bot is mentioned in Slack',
    config: {
      event: 'mention',
    },
  },
  {
    id: 'slack.file',
    description: 'When a file is shared in Slack',
    config: {
      event: 'file_shared',
    },
  },
];
