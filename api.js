import express from 'express';
import connectDB from './DB/db.js';
import * as userUtils from './Utils/DBUtils/userUtils.js';
import * as taskUtils from './Utils/DBUtils/taskUtils.js';
import cors from 'cors';

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cors());
app.use(express.static('public'));


connectDB();


app.post('/api/users', async (req, res) => {
    try {
        const { discordId, username } = req.body;
        if (!discordId || !username) {
            return res.status(400).json({ error: 'discordId and username are required' });
        }
        const user = await userUtils.findOrCreateUser(discordId, username);
        res.status(201).json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/users/:discordId', async (req, res) => {
    try {
        const user = await userUtils.getUserProfile(req.params.discordId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/users/:discordId/strikes/add', async (req, res) => {
    try {
        const strikes = await userUtils.addStrikeByDiscordId(req.params.discordId);
        if (strikes === null) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ success: true, strikes });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/users/:discordId/strikes/remove', async (req, res) => {
    try {
        const strikes = await userUtils.removeStrikeByDiscordId(req.params.discordId);
        res.json({ success: true, strikes });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.post('/api/assignments', async (req, res) => {
    try {
        const { discordId, roleCategoryId, taskType, deadlineHours } = req.body;
        
        if (!discordId || !roleCategoryId || !taskType || !deadlineHours) {
            return res.status(400).json({ 
                error: 'discordId, roleCategoryId, taskType, and deadlineHours are required' 
            });
        }

        const userDoc = await userUtils.getUserProfile(discordId);
        if (!userDoc) {
            return res.status(404).json({ error: 'User not found. Create user first.' });
        }

        const deadline = new Date(Date.now() + deadlineHours * 60 * 60 * 1000);
        
        const assignment = await taskUtils.createAssignment(userDoc, {
            roleCategoryId,
            taskType,
            deadline
        });
        
        res.status(201).json({ success: true, data: assignment });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/assignments/:taskId/complete', async (req, res) => {
    try {
        const { userDbId } = req.body;
        if (!userDbId) {
            return res.status(400).json({ error: 'userDbId is required' });
        }
        
        const task = await taskUtils.completeAssignment(req.params.taskId, userDbId);
        if (!task) {
            return res.status(404).json({ error: 'Assignment not found' });
        }
        
        res.json({ success: true, data: task });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/assignments/:taskId/extend', async (req, res) => {
    try {
        const { extensionHours } = req.body;
        if (!extensionHours) {
            return res.status(400).json({ error: 'extensionHours is required' });
        }
        
        const extensionMs = extensionHours * 60 * 60 * 1000;
        const task = await taskUtils.extendAssignment(req.params.taskId, extensionMs);
        
        res.json({ success: true, data: task });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/assignments/pending/:discordUserId', async (req, res) => {
    try {
        const task = await taskUtils.fetchPendingTask(req.params.discordUserId);
        if (!task) {
            return res.status(404).json({ error: 'No pending task found' });
        }
        res.json({ success: true, data: task });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/assignments/overdue', async (_req, res) => {
    try {
        const tasks = await taskUtils.fetchOverdueTasks();
        res.json({ success: true, data: tasks });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Test server running on http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT} to access the test interface`);
});
