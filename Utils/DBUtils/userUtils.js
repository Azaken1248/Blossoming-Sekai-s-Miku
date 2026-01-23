import User from '../../DB/Schemas/user.js';


export const findOrCreateUser = async (discordId, username) => {
    let user = await User.findOne({ discordId });
    
    if (!user) {
        user = await User.create({
            discordId,
            username,
            strikes: 0,
            assignments: [] 
        });
        console.log(`New User Created: ${username}`);
    }
    return user;
};


export const getUserProfile = async (discordId) => {
    return await User.findOne({ discordId })
        .populate('assignments') 
        .lean(); 
};


export const addStrike = async (userId) => {
    const updatedUser = await User.findByIdAndUpdate(
        userId, 
        { $inc: { strikes: 1 } }, 
        { new: true, runValidators: true } 
    );
    return updatedUser ? updatedUser.strikes : null;
};

export const removeStrike = async (userId) => {
    const updatedUser = await User.findOneAndUpdate(
        { _id: userId, strikes: { $gt: 0 } }, 
        { $inc: { strikes: -1 } }, 
        { new: true }
    );
    return updatedUser ? updatedUser.strikes : 0;
};

export const addStrikeByDiscordId = async (discordId) => {
    const updatedUser = await User.findOneAndUpdate(
        { discordId },
        { $inc: { strikes: 1 } },
        { new: true, runValidators: true }
    );
    return updatedUser ? updatedUser.strikes : null;
};

export const removeStrikeByDiscordId = async (discordId) => {
    const updatedUser = await User.findOneAndUpdate(
        { discordId, strikes: { $gt: 0 } },
        { $inc: { strikes: -1 } },
        { new: true }
    );
    return updatedUser ? updatedUser.strikes : 0;
};

export const setHiatus = async (discordId, isOnHiatus) => {
    const updatedUser = await User.findOneAndUpdate(
        { discordId },
        { isOnHiatus },
        { new: true }
    );
    return updatedUser;
};

export const getUsersWithStrikes = async () => {
    return await User.find({ strikes: { $gt: 0 } }).sort({ strikes: -1 }).lean();
};