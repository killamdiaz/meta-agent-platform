const rawApi = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
export const API_BASE_URL = rawApi.replace(/\/$/, '');
const defaultWs = API_BASE_URL.replace(/^http/, 'ws');
export const WS_BASE_URL = (import.meta.env.VITE_WS_URL || `${defaultWs}/chat`).replace(/\/$/, '');
