import connectDB from '../DB/db.js';
import app from './app.js';
import { describeCorsPolicy } from './corsPolicy.js';
import { reportApiKeyStatus } from './middleware/requireApiKey.js';
import { describeAddress, readHost, readPort } from './serverAddress.js';

const PORT = readPort(process.env.PORT);
const HOST = readHost(process.env.HOST);

connectDB();

app.listen(PORT, HOST, () => {
    console.log(`API Server running strictly as an API on ${describeAddress(HOST, PORT)}`);
    console.log(describeCorsPolicy());
    reportApiKeyStatus();
});
