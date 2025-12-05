const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
};

export function slackToPlainText(input: string) {
  if (!input) return '';
  let text = input;
  text = text.replace(/<@([A-Z0-9]+)>/g, '@$1');
  text = text.replace(/<#([A-Z0-9]+)\|([^>]+)>/g, (_match, _id, name) => `#${name}`);
  text = text.replace(/<!here>/g, '@here').replace(/<!channel>/g, '@channel').replace(/<!everyone>/g, '@everyone');
  Object.entries(ENTITY_MAP).forEach(([entity, value]) => {
    text = text.replace(new RegExp(entity, 'g'), value);
  });
  return text;
}
