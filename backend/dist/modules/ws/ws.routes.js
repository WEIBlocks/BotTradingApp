import { handleTradesWs, handleArenaWs, handleBotDecisionsWs, handleNotificationsWs, handleAppWs } from './ws.handler.js';
export async function wsRoutes(app) {
    // Live trades feed
    app.get('/trades', { websocket: true }, (socket, request) => {
        const ws = socket.socket ?? socket;
        handleTradesWs(ws, request);
    });
    // Arena live feed
    app.get('/arena/:sessionId', { websocket: true }, (socket, request) => {
        const ws = socket.socket ?? socket;
        handleArenaWs(ws, request);
    });
    // Bot live decision feed
    app.get('/bot/:botId/decisions', { websocket: true }, (socket, request) => {
        const ws = socket.socket ?? socket;
        handleBotDecisionsWs(ws, request);
    });
    // Notifications feed
    app.get('/notifications', { websocket: true }, (socket, request) => {
        const ws = socket.socket ?? socket;
        handleNotificationsWs(ws, request);
    });
    // Unified app feed — single multiplexed WS for mobile (equity, trades, notifications)
    app.get('/app', { websocket: true }, (socket, request) => {
        const ws = socket.socket ?? socket;
        handleAppWs(ws, request);
    });
}
