import mongoose, { type Types } from 'mongoose';

export interface StoredMember {
    _id: Types.ObjectId;
    discordId: string;
    username?: string | null | undefined;
    strikes?: number | undefined;
    isOnHiatus?: boolean | undefined;
    isDeboarded?: boolean | undefined;
    deboarded_statusMessage?: string | undefined;
    roles?: string[] | undefined;
    joinedAt?: Date | undefined;
    deboarded_at?: Date | null | undefined;
    assignments?: Types.ObjectId[] | undefined;
    cardImage?: string | null | undefined;
}

export const DEFAULT_DEBOARDED_MESSAGE = '✨ ~Scouted in a different SEKAI~ ✨';

const userSchema = new mongoose.Schema<StoredMember>({
    discordId: {
        type: String,
        required: true,
        unique: true,
    },
    username: String,
    strikes: {
        type: Number,
        default: 0,
        min: 0,
        max: 3,
    },
    isOnHiatus: {
        type: Boolean,
        default: false,
    },
    isDeboarded: {
        type: Boolean,
        default: false,
    },
    deboarded_statusMessage: {
        type: String,
        default: DEFAULT_DEBOARDED_MESSAGE,
    },
    roles: [String],
    joinedAt: {
        type: Date,
        default: Date.now,
    },
    deboarded_at: {
        type: Date,
        default: null,
    },
    assignments: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Assignment',
        },
    ],
    cardImage: {
        type: String,
        default: null,
    },
});

export default mongoose.model<StoredMember>('User', userSchema);
