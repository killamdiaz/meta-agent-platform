import JSZip from 'jszip';
export class MarketplaceService {
    constructor(store) {
        this.store = store;
    }
    async list() {
        const connectors = await this.store.listMarketplace();
        return connectors.map((connector) => ({
            id: connector.id,
            name: connector.manifest.name,
            version: connector.manifest.version,
            description: connector.manifest.description,
            icon: connector.manifest.icon,
            publisher: connector.manifest.publisher,
            category: connector.manifest.category,
            verified: connector.verified,
            downloadCount: connector.downloadCount,
        }));
    }
    async downloadAsZip(connectorId) {
        const connector = await this.store.getById(connectorId);
        if (!connector) {
            throw new Error('Connector not found');
        }
        const zip = await this.buildZip(connector);
        await this.store.incrementDownload(connectorId);
        return zip;
    }
    async buildZip(connector) {
        const zip = new JSZip();
        zip.file('connector.json', JSON.stringify(connector.manifest, null, 2));
        const actions = zip.folder('actions');
        Object.entries(connector.actions).forEach(([name, spec]) => {
            actions?.file(`${name}.json`, JSON.stringify(spec, null, 2));
        });
        const triggers = zip.folder('triggers');
        Object.entries(connector.triggers).forEach(([name, spec]) => {
            triggers?.file(`${name}.json`, JSON.stringify(spec, null, 2));
        });
        const transforms = zip.folder('transforms');
        Object.entries(connector.transforms).forEach(([name, src]) => {
            transforms?.file(`${name}.js`, src);
        });
        return zip.generateAsync({ type: 'nodebuffer' });
    }
}
