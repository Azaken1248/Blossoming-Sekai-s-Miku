import Assignment from '../../DB/Schemas/assignment.js';
import User from '../../DB/Schemas/user.js';


export const createAssignment = async (userDoc, assignmentData) => {

    const newTask = await Assignment.create({
        userId: userDoc._id,            
        discordUserId: userDoc.discordId,
        roleCategoryId: assignmentData.roleCategoryId,
        roleName: assignmentData.roleName,
        taskType: assignmentData.taskType,
        taskName: assignmentData.taskName || '',
        description: assignmentData.description || '',
        deadline: assignmentData.deadline
    });

    await User.findByIdAndUpdate(userDoc._id, {
        $push: { assignments: newTask._id }
    });

    return newTask;
};


export const completeAssignment = async (taskId, userDbId) => {
    const task = await Assignment.findByIdAndUpdate(
        taskId, 
        { status: 'COMPLETED' }, 
        { new: true }
    );

    return task;
};


export const extendAssignment = async (taskId, extensionMs) => {
    const task = await Assignment.findById(taskId);
    if (!task) throw new Error("Task not found");
    if (task.hasExtended) throw new Error("ALREADY_EXTENDED");

    task.deadline = new Date(task.deadline.getTime() + extensionMs);
    task.hasExtended = true;
    await task.save();

    return task;
};


export const fetchPendingTask = async (discordUserId) => {

    const user = await User.findOne({ discordId: discordUserId });
    if (!user) return null;

    return await Assignment.findOne({
        userId: user._id,
        status: 'PENDING'
    }).sort({ deadline: 1 }); 
};


export const fetchOverdueTasks = async () => {
    const now = new Date();
    return await Assignment.find({
        status: 'PENDING',
        deadline: { $lt: now }
    }).populate('userId'); 
};


export const fetchTaskHistory = async (filters = {}) => {
    const query = {};
    
    if (filters.discordUserId) {
        query.discordUserId = filters.discordUserId;
    }
    
    if (filters.taskName) {
        query.$or = [
            { taskName: { $regex: filters.taskName, $options: 'i' } },
            { taskType: { $regex: filters.taskName, $options: 'i' } }
        ];
    }
    
    if (filters.status) {
        query.status = filters.status.toUpperCase();
    }
    
    if (filters.roleName) {
        query.roleName = { $regex: filters.roleName, $options: 'i' };
    }
    
    const limit = filters.limit || 50;
    
    return await Assignment.find(query)
        .sort({ assignedAt: -1 })
        .populate('userId')
        .limit(limit);
};


export const fetchTaskById = async (taskId) => {
    return await Assignment.findById(taskId).populate('userId');
};