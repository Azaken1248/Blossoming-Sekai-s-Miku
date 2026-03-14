import express from 'express';
import cors from 'cors';
import connectDB from '../DB/db.js';

import userRoutes from './routes/users.js';
import assignmentRoutes from './routes/assignments.js';
import analyticsRoutes from './routes/analytics.js';

const app = express();
const PORT = 3000;

app.use(express.json());
// CORS is critical here since your frontend will be calling from a different port/domain
app.use(cors());

connectDB();

app.use('/api/users', userRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/v1/analytics', analyticsRoutes); 

app.get('/', (_req, res) => {
    const apiLandingPage = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Blossoming Sekai API Gateway</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=JetBrains+Mono:wght@600&display=swap" rel="stylesheet">
        <style>
            :root {
                --ctp-base: #1e1e2e; --ctp-surface0: #313244; --ctp-surface1: #45475a;
                --ctp-text: #cdd6f4; --ctp-subtext0: #a6adc8; --miku-primary: #94e2d5;
                --miku-secondary: #f5c2e7; --miku-accent: #89dceb; --ctp-green: #a6e3a1;
            }
            body {
                background-color: var(--ctp-base); color: var(--ctp-text);
                font-family: 'Inter', sans-serif; display: flex; flex-direction: column;
                align-items: center; justify-content: center; min-height: 100vh; margin: 0;
            }
            .container {
                background-color: var(--ctp-surface0); padding: 3rem; border-radius: 20px;
                border: 1px solid var(--ctp-surface1); box-shadow: 0 20px 40px rgba(0,0,0,0.4);
                text-align: center; max-width: 650px; width: 90%;
            }
            h1 {
                font-weight: 800; font-size: 2.2rem; margin-bottom: 0.5rem;
                background: linear-gradient(to right, var(--miku-primary), var(--miku-accent));
                -webkit-background-clip: text; -webkit-text-fill-color: transparent;
            }
            p { color: var(--ctp-subtext0); margin-bottom: 2.5rem; font-size: 1.1rem; }
            .endpoint {
                background-color: var(--ctp-base); padding: 1.2rem; border-radius: 12px;
                font-family: 'JetBrains Mono', monospace; text-align: left;
                border-left: 4px solid var(--miku-primary); margin-bottom: 1rem;
            }
            .method { 
                color: var(--miku-secondary); font-weight: 600; margin-right: 15px; 
                background: rgba(245, 194, 231, 0.1); padding: 0.2rem 0.6rem; border-radius: 6px;
            }
            .status {
                display: inline-block; padding: 0.4rem 1rem; color: var(--ctp-green);
                background-color: rgba(166, 227, 161, 0.15); border-radius: 50px;
                font-size: 0.9rem; font-weight: 600; margin-top: 2.5rem;
                border: 1px solid rgba(166, 227, 161, 0.3);
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Blossoming Sekai API</h1>
            <p>Pure API Backend. No static files served here.</p>
            <div class="endpoint"><span class="method">USE</span> /api/users</div>
            <div class="endpoint"><span class="method">USE</span> /api/assignments</div>
            <div class="endpoint"><span class="method">USE</span> /api/v1/analytics</div>
            <div class="status">● System Operational</div>
        </div>
    </body>
    </html>
    `;
    res.send(apiLandingPage);
});

app.listen(PORT, () => {
    console.log(`API Server running strictly as an API on http://localhost:${PORT}`);
});