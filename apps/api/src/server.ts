import { createApp } from './app.js';
import { connectToDatabase, closeDatabase } from './db/client.js';
import { initializeIndexes } from './db/indexes.js';
import { outboxDispatcher } from './realtime/dispatcher.js';
import { connectionManager } from './realtime/connection.manager.js';
import { env } from './config/env.js';
import { logger } from './observability/logger.js';

async function bootstrap() {
  try {
    const { db } = await connectToDatabase();
    await initializeIndexes(db);
    await outboxDispatcher.start();

    const app = createApp();
    const server = app.listen(env.PORT, () => {
      logger.info({ port: env.PORT, env: env.NODE_ENV }, 'CrewGrid API server started');
    });

    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Graceful shutdown initiated...');
      outboxDispatcher.stop();
      connectionManager.closeAll();
      server.close(async () => {
        logger.info('HTTP server closed.');
        await closeDatabase();
        process.exit(0);
      });

      // Force exit after 10s if connections do not drain
      setTimeout(() => {
        logger.error('Forceful shutdown after timeout');
        process.exit(1);
      }, 10000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err: any) {
    logger.fatal({ error: err.message, stack: err.stack }, 'Fatal error during API bootstrap');
    process.exit(1);
  }
}

bootstrap();

