import Assignment from '../../DB/Schemas/assignment.js';
import User from '../../DB/Schemas/user.js';
import { countExtensionsUsed, MAX_EXTENSIONS_PER_TASK } from '../domain/extensions.js';
import { containsText } from './searchPattern.js';

export const createAssignment = async (userDoc, assignmentData) => {
    const newTask = await Assignment.create({
        userId: userDoc._id,
        discordUserId: userDoc.discordId,
        roleCategoryId: assignmentData.roleCategoryId,
        roleName: assignmentData.roleName,
        taskType: assignmentData.taskType,
        taskName: assignmentData.taskName || '',
        description: assignmentData.description || '',
        deadline: assignmentData.deadline,
        customExtension: assignmentData.customExtension ?? null,
    });

    await User.findByIdAndUpdate(userDoc._id, {
        $push: { assignments: newTask._id },
    });

    return newTask;
};

/**
 * Mark a task complete.
 *
 * The status precondition makes this idempotent: a second approval (two owners
 * clicking at once, or a stale button) matches nothing and returns null rather
 * than completing the task twice and removing two strikes for one piece of work.
 *
 * Returns the updated task, or null if it was already resolved.
 */
export const completeAssignment = async (taskId) => {
    return await Assignment.findOneAndUpdate(
        { _id: taskId, status: { $in: ['PENDING', 'LATE'] } },
        { status: 'COMPLETED', completedAt: new Date() },
        { new: true },
    );
};

export const extendAssignment = async (taskId, extensionMs) => {
    if (!Number.isFinite(extensionMs) || extensionMs <= 0) {
        throw new Error('INVALID_EXTENSION');
    }

    const task = await Assignment.findById(taskId);
    if (!task) throw new Error('TASK_NOT_FOUND');

    const currentExtensions = countExtensionsUsed(task);
    if (currentExtensions >= MAX_EXTENSIONS_PER_TASK) throw new Error('ALREADY_EXTENDED');

    task.deadline = new Date(task.deadline.getTime() + extensionMs);
    task.hasExtended = true;
    task.extensionCount = currentExtensions + 1;

    await task.save();

    return task;
};

export const fetchPendingTask = async (discordUserId) => {
    const user = await User.findOne({ discordId: discordUserId });
    if (!user) return null;

    return await Assignment.findOne({
        userId: user._id,
        status: 'PENDING',
    }).sort({ deadline: 1 });
};

export const fetchOverdueTasks = async () => {
    const now = new Date();
    return await Assignment.find({
        status: 'PENDING',
        deadline: { $lt: now },
    }).populate('userId');
};

export const fetchTaskHistory = async (filters = {}) => {
    const query = {};

    if (filters.discordUserId) {
        query.discordUserId = filters.discordUserId;
    }

    if (filters.taskName) {
        const taskNamePattern = containsText(filters.taskName);
        query.$or = [{ taskName: taskNamePattern }, { taskType: taskNamePattern }];
    }

    if (filters.status) {
        query.status = filters.status.toUpperCase();
    }

    if (filters.roleName) {
        query.roleName = containsText(filters.roleName);
    }

    const limit = filters.limit || 50;

    return await Assignment.find(query).sort({ assignedAt: -1 }).populate('userId').limit(limit);
};

export const fetchTaskById = async (taskId) => {
    return await Assignment.findById(taskId).populate('userId');
};

export const fetchTasksNeedingReminders = async (config) => {
    const now = new Date();

    const tasks = await Assignment.find({
        status: 'PENDING',
        deadline: { $gt: now },
    }).populate('userId');

    const tasksToRemind = [];

    for (const task of tasks) {
        const timeUntilDeadline = task.deadline.getTime() - now.getTime();
        const taskDuration = task.deadline.getTime() - task.assignedAt.getTime();

        let firstThreshold, finalThreshold;

        if (taskDuration <= config.REMINDER_THRESHOLDS.SHORT_TASK.duration) {
            firstThreshold = config.REMINDER_THRESHOLDS.SHORT_TASK.firstReminder;
            finalThreshold = config.REMINDER_THRESHOLDS.SHORT_TASK.finalReminder;
        } else if (taskDuration <= config.REMINDER_THRESHOLDS.MEDIUM_TASK.duration) {
            firstThreshold = config.REMINDER_THRESHOLDS.MEDIUM_TASK.firstReminder;
            finalThreshold = config.REMINDER_THRESHOLDS.MEDIUM_TASK.finalReminder;
        } else {
            firstThreshold = config.REMINDER_THRESHOLDS.LONG_TASK.firstReminder;
            finalThreshold = config.REMINDER_THRESHOLDS.LONG_TASK.finalReminder;
        }

        if (!task.firstReminderSent && timeUntilDeadline <= firstThreshold) {
            tasksToRemind.push({ task, reminderType: 'first' });
        } else if (!task.finalReminderSent && timeUntilDeadline <= finalThreshold) {
            tasksToRemind.push({ task, reminderType: 'final' });
        }
    }

    return tasksToRemind;
};

export const markReminderSent = async (taskId, reminderType) => {
    const updateField = reminderType === 'first' ? { firstReminderSent: true } : { finalReminderSent: true };
    return await Assignment.findByIdAndUpdate(taskId, updateField);
};

export const fetchFreeUsersWithStatus = async () => {
    const busyUserIds = await Assignment.distinct('userId', {
        status: { $in: ['PENDING', 'LATE'] },
    });

    const users = await User.find({
        _id: { $nin: busyUserIds },
    }).populate({
        path: 'assignments',
        match: { status: 'COMPLETED' },
        options: { sort: { deadline: -1 }, limit: 1 },
    });

    return users.map((user) => ({
        discordId: user.discordId,
        username: user.username,
        isOnHiatus: user.isOnHiatus,
        lastTask: user.assignments[0] || null,
    }));
};

export const checkUserAvailability = async (discordId) => {
    const user = await User.findOne({ discordId }).populate({
        path: 'assignments',
        // Newest completion first where known, falling back to deadline for
        // rows written before completedAt existed.
        options: { sort: { completedAt: -1, deadline: -1 } },
    });

    if (!user) return null;

    const activeTask = user.assignments.find((a) => ['PENDING', 'LATE'].includes(a.status));
    const lastCompleted = user.assignments.find((a) => a.status === 'COMPLETED');

    return {
        discordId: user.discordId,
        username: user.username,
        isOnHiatus: user.isOnHiatus,
        isFree: !activeTask,
        activeTask: activeTask || null,
        lastTask: lastCompleted || null,
    };
};
