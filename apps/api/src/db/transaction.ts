import { ClientSession, TransactionOptions } from 'mongodb';
import { getMongoClient } from './client.js';
import { AppError } from '@crewgrid/contracts';
import { logger } from '../observability/logger.js';

export interface DomainTransactionContext {
  session: ClientSession;
}

export interface TransactionExecutionOptions {
  maxRetries?: number;
  initialBackoffMs?: number;
}

/**
 * Runs domain operations inside a MongoDB replica-set transaction.
 * Automatically retries on transient transaction errors with jittered backoff.
 */
export async function withDomainTransaction<T>(
  operation: (ctx: DomainTransactionContext) => Promise<T>,
  options?: TransactionExecutionOptions
): Promise<T> {
  const client = getMongoClient();
  const session = client.startSession();

  const maxRetries = options?.maxRetries ?? 5;
  const initialBackoffMs = options?.initialBackoffMs ?? 20;

  const transactionOptions: TransactionOptions = {
    readPreference: 'primary',
    readConcern: { level: 'local' },
    writeConcern: { w: 'majority' }
  };

  try {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        let result: T;
        await session.withTransaction(async () => {
          result = await operation({ session });
        }, transactionOptions);

        return result!;
      } catch (err: any) {
        // AppError (e.g. validation, permission, capacity conflict) should immediately abort without retry
        if (err instanceof AppError) {
          throw err;
        }

        const isTransient =
          err.hasErrorLabel?.('TransientTransactionError') ||
          err.hasErrorLabel?.('UnknownTransactionCommitResult') ||
          err.codeName === 'WriteConflict';

        if (isTransient && attempt < maxRetries) {
          const jitter = Math.floor(Math.random() * 20);
          const delayMs = initialBackoffMs * Math.pow(2, attempt - 1) + jitter;
          logger.warn(
            { attempt, maxRetries, delayMs, error: err.message },
            'Transient transaction error encountered, retrying with backoff...'
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        logger.error({ error: err.message, stack: err.stack, attempt }, 'Transaction failed permanently');
        throw err;
      }
    }

    throw new AppError(503, 'TEMPORARILY_UNAVAILABLE', 'Database transaction failed after maximum retries');
  } finally {
    await session.endSession();
  }
}

