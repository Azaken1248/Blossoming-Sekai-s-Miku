import * as records from '../../Utils/DBUtils/apiRecords.ts';
import User from '../../DB/Schemas/user.ts';
import config from '../../config.js';

const SNOWFLAKE = /^\d{17,20}$/;
const MAX_DEADLINE_HOURS = 24 * 365;
const MAX_EXTENSION_HOURS = 24 * 365;

/** Parse a positive, finite number of hours. Returns null when invalid. */
const parseHours = (value, max) => {
    const hours = Number(value);
    if (!Number.isFinite(hours) || hours <= 0 || hours > max) return null;
    return hours;
};

export const createAssignment = async (req, res) => {
    try {
        const { discordId, roleCategoryId, roleName, taskType, taskName, description, deadlineHours } = req.body ?? {};

        const missing = ['discordId', 'roleCategoryId', 'taskType'].filter((field) => !req.body?.[field]);
        if (missing.length) {
            return res.status(400).json({ error: `Missing required field(s): ${missing.join(', ')}` });
        }

        if (!SNOWFLAKE.test(String(discordId))) {
            return res.status(400).json({ error: 'discordId must be a Discord snowflake (17-20 digits)' });
        }

        const hours = parseHours(deadlineHours, MAX_DEADLINE_HOURS);
        if (hours === null) {
            return res.status(400).json({
                error: `deadlineHours must be a number greater than 0 and at most ${MAX_DEADLINE_HOURS}`,
            });
        }

        const rule = config.RULES[roleCategoryId];
        if (!rule) {
            return res.status(400).json({ error: `Unknown roleCategoryId: ${roleCategoryId}` });
        }

        // roleName is required by the schema. It was never sent before, so every
        // call to this endpoint failed validation and returned 500. Fall back to
        // the configured name for the role rather than rejecting the request.
        const resolvedRoleName = roleName || rule.name;
        if (!resolvedRoleName) {
            return res.status(400).json({ error: 'roleName is required and could not be derived from roleCategoryId' });
        }

        // Only the fields needed to create the task - avoids loading the whole
        // populated assignment history just to check the user exists.
        const userDoc = await User.findOne({ discordId }).select('_id discordId isDeboarded').lean();
        if (!userDoc) {
            return res.status(404).json({ error: 'User not found. Create user first.' });
        }
        if (userDoc.isDeboarded) {
            return res.status(409).json({ error: 'User has been deboarded and cannot receive new assignments.' });
        }

        const assignment = await records.createAssignment({
            memberId: userDoc._id.toString(),
            discordUserId: userDoc.discordId,
            roleCategoryId,
            roleName: resolvedRoleName,
            taskType,
            taskName: taskName ?? '',
            description: description ?? '',
            deadline: new Date(Date.now() + hours * 60 * 60 * 1000),
        });

        res.status(201).json({ success: true, data: assignment });
    } catch (error) {
        console.error('[API] createAssignment failed:', error);
        res.status(500).json({ error: 'Failed to create assignment' });
    }
};

export const completeAssignment = async (req, res) => {
    try {
        // `userDbId` used to be required here but was never read by the util,
        // so callers had to send a field that did nothing. It is now optional
        // and ignored.
        const task = await records.completeAssignment(req.params.taskId);
        if (!task) {
            return res.status(409).json({ error: 'Assignment not found, or already completed' });
        }

        res.json({ success: true, data: task });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({ error: 'Invalid assignment id' });
        }
        console.error('[API] completeAssignment failed:', error);
        res.status(500).json({ error: 'Failed to complete assignment' });
    }
};

export const extendAssignment = async (req, res) => {
    try {
        const hours = parseHours(req.body?.extensionHours, MAX_EXTENSION_HOURS);
        if (hours === null) {
            return res.status(400).json({
                error: `extensionHours must be a number greater than 0 and at most ${MAX_EXTENSION_HOURS}`,
            });
        }

        const task = await records.extendAssignment(req.params.taskId, hours * 60 * 60 * 1000);
        res.json({ success: true, data: task });
    } catch (error) {
        if (error.message === 'ALREADY_EXTENDED') {
            return res.status(409).json({ error: 'This assignment has already used all of its extensions' });
        }
        if (error.message === 'TASK_CHANGED') {
            return res.status(409).json({ error: 'This assignment was changed by another request' });
        }
        if (error.message === 'TASK_NOT_FOUND') {
            return res.status(404).json({ error: 'Assignment not found' });
        }
        if (error.name === 'CastError') {
            return res.status(400).json({ error: 'Invalid assignment id' });
        }
        console.error('[API] extendAssignment failed:', error);
        res.status(500).json({ error: 'Failed to extend assignment' });
    }
};

export const getPendingTask = async (req, res) => {
    try {
        const task = await records.fetchPendingTask(req.params.discordUserId);
        if (!task) {
            return res.status(404).json({ error: 'No pending task found' });
        }
        res.json({ success: true, data: task });
    } catch (error) {
        console.error('[API] getPendingTask failed:', error);
        res.status(500).json({ error: 'Failed to fetch pending task' });
    }
};

export const getOverdueTasks = async (_req, res) => {
    try {
        const tasks = await records.fetchOverdueTasks();
        res.json({ success: true, count: tasks.length, data: tasks });
    } catch (error) {
        console.error('[API] getOverdueTasks failed:', error);
        res.status(500).json({ error: 'Failed to fetch overdue tasks' });
    }
};
