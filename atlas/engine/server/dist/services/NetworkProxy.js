export class NetworkProxy {
    configure(config) {
        const timestamp = new Date().toISOString();
        if (!config.allowInternet) {
            return {
                timestamp,
                message: 'Network proxy configured for offline execution. External requests are blocked.'
            };
        }
        const domains = config.domainsAllowed.length > 0 ? config.domainsAllowed.join(', ') : 'no domains specified';
        return {
            timestamp,
            message: `Network proxy enabled with internet access limited to: ${domains}.`
        };
    }
}
