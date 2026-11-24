import type { ClientSession, Connection } from 'mongoose';

export type RunTransaction = <Result>(work: (session: ClientSession) => Promise<Result>) => Promise<Result>;

const OPTIONS = { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } } as const;

export const createTransactionRunner =
    (connection: Connection): RunTransaction =>
    async (work) => {
        const session = await connection.startSession();
        try {
            return await session.withTransaction(() => work(session), OPTIONS);
        } finally {
            await session.endSession();
        }
    };
