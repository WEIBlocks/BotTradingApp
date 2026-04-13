import { authenticate } from '../../middleware/authenticate.js';
import * as exchangeService from './exchange.service.js';
import { connectBodySchema, oauthInitiateBodySchema, oauthCallbackBodySchema, exchangeIdParamsSchema, dataResponseSchema, } from './exchange.schema.js';
export async function exchangeRoutes(app) {
    const zApp = app.withTypeProvider();
    // GET /available (no auth)
    zApp.get('/available', {
        schema: {
            response: { 200: dataResponseSchema },
        },
    }, async (_request, _reply) => {
        const exchanges = await exchangeService.getAvailableExchanges();
        return { data: exchanges };
    });
    // POST /connect (auth)
    zApp.post('/connect', {
        preHandler: [authenticate],
        schema: {
            body: connectBodySchema,
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const { provider, apiKey, apiSecret, sandbox } = request.body;
        const connection = await exchangeService.connectWithApiKey(request.user.userId, provider, apiKey, apiSecret, sandbox);
        return { data: connection };
    });
    // POST /test-connection (auth) - test API keys without saving
    zApp.post('/test-connection', {
        preHandler: [authenticate],
        schema: {
            body: connectBodySchema,
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const { provider, apiKey, apiSecret, sandbox } = request.body;
        const result = await exchangeService.testConnection(provider, apiKey, apiSecret, sandbox);
        return { data: result };
    });
    // POST /oauth/initiate (auth)
    zApp.post('/oauth/initiate', {
        preHandler: [authenticate],
        schema: {
            body: oauthInitiateBodySchema,
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const { provider } = request.body;
        const result = await exchangeService.initiateOAuth(provider);
        return { data: result };
    });
    // POST /oauth/callback (auth)
    zApp.post('/oauth/callback', {
        preHandler: [authenticate],
        schema: {
            body: oauthCallbackBodySchema,
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const { provider, code } = request.body;
        const connection = await exchangeService.handleOAuthCallback(provider, code, request.user.userId);
        return { data: connection };
    });
    // POST /:id/resync (auth)
    zApp.post('/:id/resync', {
        preHandler: [authenticate],
        schema: {
            params: exchangeIdParamsSchema,
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const { id } = request.params;
        const connection = await exchangeService.resync(id, request.user.userId);
        return { data: connection };
    });
    // POST /:id/disconnect (auth)
    zApp.post('/:id/disconnect', {
        preHandler: [authenticate],
        schema: {
            params: exchangeIdParamsSchema,
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const { id } = request.params;
        const connection = await exchangeService.disconnect(id, request.user.userId);
        return { data: connection };
    });
    // GET /user/connections (auth)
    zApp.get('/user/connections', {
        preHandler: [authenticate],
        schema: {
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const connections = await exchangeService.getUserConnections(request.user.userId);
        return { data: connections };
    });
}
