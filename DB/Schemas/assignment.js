import mongoose from 'mongoose';

const assignmentSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        required: true, 
        ref: 'User' 
    },
    discordUserId: {
        type: String,
        required: true
    },
    roleCategoryId: { 
        type: String, 
        required: true 
    },
    roleName: {
        type: String,
        required: true
    },
    taskType: { 
        type: String, 
        required: true 
    },
    taskName: {
        type: String,
        default: ''
    },
    description: {
        type: String,
        default: ''
    },
    assignedAt: { 
        type: Date, 
        default: Date.now 
    },
    deadline: { 
        type: Date, 
        required: true 
    },
    hasExtended: { 
        type: Boolean, 
        default: false 
    },
    extensionCount: {
        type: Number,
        default: 0
    },
    customExtension: {
        type: Number,
        default: null
    },
    submissionChannelId: {
        type: String,
        default: null
    },
    firstReminderSent: {
        type: Boolean,
        default: false
    },
    finalReminderSent: {
        type: Boolean,
        default: false
    },
    status: { 
        type: String, 
        default: 'PENDING',
        enum: ['PENDING', 'COMPLETED', 'LATE', 'EXCUSED']
    }
});

assignmentSchema.index({ status: 1, deadline: 1 });

export default mongoose.model('Assignment', assignmentSchema);