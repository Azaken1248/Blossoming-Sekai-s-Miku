import connectDB from '../DB/db.js';
import app from './app.ts';
import { describeCorsPolicy } from './corsPolicy.ts';
import { reportApiKeyStatus } from './middleware/requireApiKey.ts';
import { describeAddress, readHost, readPort } from './serverAddress.ts';

const PORT = readPort(process.env.PORT);
const HOST = readHost(process.env.HOST);

void connectDB();

app.listen(PORT, HOST, () => {
    console.log(`API Server running on ${describeAddress(HOST, PORT)}`);
    console.log(describeCorsPolicy());
    reportApiKeyStatus();
});
