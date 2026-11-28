import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import userRoutes from './routes/users.ts';
import assignmentRoutes from './routes/assignments.ts';
import analyticsRoutes from './routes/analytics.ts';
import { getProfileCardSvg, getSharePage } from './controllers/cardController.ts';
import { buildCorsOptions } from './corsPolicy.ts';
import { LANDING_PAGE } from './views/landing.ts';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cors(buildCorsOptions()));
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

app.use('/api/users', userRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/v1/analytics', analyticsRoutes);

app.get('/share/user/:discordId/card.svg', getProfileCardSvg);
app.get('/share/user/:discordId', getSharePage);
app.get('/', (_req, res) => {
    res.send(LANDING_PAGE);
});

export default app;
