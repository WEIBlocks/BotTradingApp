import { buildApp } from './app.js';
import { env } from './config/env.js';
import { startAllJobs } from './jobs/index.js';
async function main() {
    const app = await buildApp();
    try {
        await app.listen({ port: env.PORT, host: env.HOST });
        console.log(`Server running at http://${env.HOST}:${env.PORT}`);
        console.log(`API docs at http://${env.HOST}:${env.PORT}/docs`);
        // Start background jobs after server is listening
        await startAllJobs();
    }
    catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}
main();
