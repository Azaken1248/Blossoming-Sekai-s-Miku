import Assignment from '../DB/Schemas/assignment.js';
import User from '../DB/Schemas/user.js';


export const createAssignment = async (userDoc, assignmentData) => {

    const newTask = await Assignment.create({
        userId: userDoc._id,            
        discordUserId: userDoc.discordId,
        roleCategoryId: assignmentData.roleCategoryId,
        taskType: assignmentData.taskType,
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

    await User.findByIdAndUpdate(userDbId, {
        $pull: { assignments: taskId }
    });

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