import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

export const startDatabase = async (name = 'sekai_test') => {
    const server = await MongoMemoryServer.create({ instance: { launchTimeout: 60_000 } });
    const uri = server.getUri(name);
    process.env.MONGO_URI = uri;
    await mongoose.connect(uri);
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
