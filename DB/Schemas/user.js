import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    discordId: { 
        type: String, 
        required: true, 
        unique: true 
    },
    username: String, 
    strikes: { 
        type: Number, 
        default: 0, 
        min: 0, 
        max: 3 
    },
    isOnHiatus: { 
        type: Boolean, 
        default: false 
    },
    isDeboarded: {
        type: Boolean,
        default: false
    },
    deboarded_statusMessage: {
        type: String,
        default: '✨ ~Scouted in a different SEKAI~ ✨'
    },
    roles: [String], 
    joinedAt: { 
        type: Date, 
        default: Date.now 
    },
    deboarded_at: {
        type: Date,
        default: null
    },
    assignments: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Assignment' 
    },],
    cardImage: { 
        type: String, 
        default: null 
    },
});

export default mongoose.model('User', userSchema);