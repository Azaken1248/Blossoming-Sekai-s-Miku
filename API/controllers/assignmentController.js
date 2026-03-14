import * as taskUtils from '../../Utils/DBUtils/taskUtils.js';
import * as userUtils from '../../Utils/DBUtils/userUtils.js';

export const createAssignment = async (req, res) => {
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
};

export const completeAssignment = async (req, res) => {
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
};

export const extendAssignment = async (req, res) => {
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
};

export const getPendingTask = async (req, res) => {
    try {
        const task = await taskUtils.fetchPendingTask(req.params.discordUserId);
        if (!task) {
            return res.status(404).json({ error: 'No pending task found' });
        }
        res.json({ success: true, data: task });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getOverdueTasks = async (_req, res) => {
    try {
        const tasks = await taskUtils.fetchOverdueTasks();
        res.json({ success: true, data: tasks });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};