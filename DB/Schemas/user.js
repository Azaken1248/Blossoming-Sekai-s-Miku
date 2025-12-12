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
    roles: [String], 
    joinedAt: { 
        type: Date, 
        default: Date.now 
    },
    assignments: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Assignment' 
    }]
});

export default mongoose.model('User', userSchema);