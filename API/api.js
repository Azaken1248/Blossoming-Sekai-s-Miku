import connectDB from '../DB/db.js';
import app from './app.js';
import { describeCorsPolicy } from './corsPolicy.js';
import { reportApiKeyStatus } from './middleware/requireApiKey.js';
import { readPort } from './serverPort.js';

const PORT = readPort(process.env.PORT);

connectDB();

app.listen(PORT, () => {
    console.log(`API Server running strictly as an API on http://localhost:${PORT}`);
    console.log(describeCorsPolicy());
    reportApiKeyStatus();
});
