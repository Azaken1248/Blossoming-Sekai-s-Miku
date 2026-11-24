import mongoose, { type Types } from 'mongoose';

export interface StoredTask {
    _id: Types.ObjectId;
    userId: Types.ObjectId;
    discordUserId: string;
    roleCategoryId: string;
    roleName?: string | undefined;
    taskType: string;
    taskName?: string | undefined;
    description?: string | undefined;
    assignedAt?: Date | undefined;
    deadline: Date;
    hasExtended?: boolean | undefined;
    extensionCount?: number | undefined;
    customExtension?: number | null | undefined;
    submissionChannelId?: string | null | undefined;
    firstReminderSent?: boolean | undefined;
    finalReminderSent?: boolean | undefined;
    status?: 'PENDING' | 'COMPLETED' | 'LATE' | 'EXCUSED' | undefined;
    completedAt?: Date | null | undefined;
}

const assignmentSchema = new mongoose.Schema<StoredTask>({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User',
    },
    discordUserId: {
        type: String,
        required: true,
    },
    roleCategoryId: {
        type: String,
        required: true,
    },
    roleName: {
        type: String,
        required: true,
    },
    taskType: {
        type: String,
        required: true,
    },
    taskName: {
        type: String,
        default: '',
    },
    description: {
        type: String,
        default: '',
    },
    assignedAt: {
        type: Date,
        default: Date.now,
    },
    deadline: {
        type: Date,
        required: true,
    },
    hasExtended: {
        type: Boolean,
        default: false,
    },
    extensionCount: {
        type: Number,
        default: 0,
    },
    customExtension: {
        type: Number,
        default: null,
    },
    submissionChannelId: {
        type: String,
        default: null,
    },
    firstReminderSent: {
        type: Boolean,
        default: false,
    },
    finalReminderSent: {
        type: Boolean,
        default: false,
    },
    status: {
        type: String,
        default: 'PENDING',
        enum: ['PENDING', 'COMPLETED', 'LATE', 'EXCUSED'],
    },
    completedAt: {
        type: Date,
        default: null,
    },
});

assignmentSchema.index({ status: 1, deadline: 1 });

export default mongoose.model<StoredTask>('Assignment', assignmentSchema);
