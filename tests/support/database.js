import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const NO_HEARTBEATS = 60 * 60 * 1000;

export const startDatabase = async (name = 'sekai_test') => {
    const server = await MongoMemoryReplSet.create({
        replSet: { count: 1, storageEngine: 'wiredTiger' },
        instanceOpts: [{ launchTimeout: 60_000 }],
    });
    const uri = server.getUri(name);
    process.env.MONGO_URI = uri;
    await mongoose.connect(uri, { heartbeatFrequencyMS: NO_HEARTBEATS });
    return {
        uri,
        db: () => mongoose.connection.db,
        reset: async () => {
            for (const collection of Object.values(mongoose.connection.collections)) {
                await collection.deleteMany({});
            }
        },
        stop: async () => {
            await mongoose.disconnect();
            await server.stop();
        },
    };
};
