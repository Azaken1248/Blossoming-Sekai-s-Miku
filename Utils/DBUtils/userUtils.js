import User from '../../DB/Schemas/user.js';
import { MAX_STRIKES } from '../domain/strikes.js';
import { containsText } from './searchPattern.js';

export const findOrCreateUser = async (discordId, username) => {
    let user = await User.findOne({ discordId });

    if (!user) {
        user = await User.create({
            discordId,
            username,
            strikes: 0,
            assignments: [],
        });
        console.log(`New User Created: ${username}`);
    }
    return user;
};

/**
 * Like findOrCreateUser, but tells the caller which branch was taken so that
 * /onboard can distinguish a genuine welcome from a re-onboard.
 */
export const findOrCreateUserWithStatus = async (discordId, username) => {
    const existing = await User.findOne({ discordId });
    if (existing) return { user: existing, created: false };

    const user = await User.create({ discordId, username, strikes: 0, assignments: [] });
    console.log(`New User Created: ${username}`);
    return { user, created: true };
};

/** Clear the deboarded flags so a returning member becomes active again. */
export const reactivateUser = async (discordId, username) => {
    return await User.findOneAndUpdate(
        { discordId },
        {
            isDeboarded: false,
            deboarded_at: null,
            ...(username ? { username } : {}),
        },
        { new: true },
    );
};

/** Cheap existence check that excludes deboarded members. */
export const isActiveMember = async (discordId) => {
    const found = await User.exists({ discordId, isDeboarded: { $ne: true } });
    return found !== null;
};

/**
 * The member's own fields, without pulling their whole assignment history.
 * Use this when you only need flags like isOnHiatus - getUserProfile populates
 * every assignment the member has ever had.
 */
export const getUserState = async (discordId) => {
    return await User.findOne({ discordId })
        .select('discordId username strikes isOnHiatus isDeboarded joinedAt')
        .lean();
};

export const getUserProfile = async (discordId) => {
    return await User.findOne({ discordId }).populate('assignments').lean();
};

/**
 * Strike mutations.
 *
 * The cap is enforced in the query rather than by schema validators: Mongoose
 * update validators check the *increment* for $inc, not the resulting value, so
 * `max: 3` on the schema does not constrain the outcome.
 *
 * All four return the member's current strike count, or `null` when no such
 * member exists - callers must distinguish "not found" from "now at zero".
 */

const currentStrikes = async (filter) => {
    const user = await User.findOne(filter).select('strikes').lean();
    return user ? user.strikes : null;
};

export const addStrike = async (userId) => {
    const updated = await User.findOneAndUpdate(
        { _id: userId, strikes: { $lt: MAX_STRIKES } },
        { $inc: { strikes: 1 } },
        { new: true },
    );
    if (updated) return updated.strikes;
    // Either the member is already at the cap, or they do not exist.
    return await currentStrikes({ _id: userId });
};

export const removeStrike = async (userId) => {
    const updated = await User.findOneAndUpdate(
        { _id: userId, strikes: { $gt: 0 } },
        { $inc: { strikes: -1 } },
        { new: true },
    );
    if (updated) return updated.strikes;
    return await currentStrikes({ _id: userId });
};

export const addStrikeByDiscordId = async (discordId) => {
    const updated = await User.findOneAndUpdate(
        { discordId, strikes: { $lt: MAX_STRIKES } },
        { $inc: { strikes: 1 } },
        { new: true },
    );
    if (updated) return updated.strikes;
    return await currentStrikes({ discordId });
};

export const removeStrikeByDiscordId = async (discordId) => {
    const updated = await User.findOneAndUpdate(
        { discordId, strikes: { $gt: 0 } },
        { $inc: { strikes: -1 } },
        { new: true },
    );
    if (updated) return updated.strikes;
    return await currentStrikes({ discordId });
};

export const setHiatus = async (discordId, isOnHiatus) => {
    const updatedUser = await User.findOneAndUpdate({ discordId }, { isOnHiatus }, { new: true });
    return updatedUser;
};

export const getUsersWithStrikes = async () => {
    return await User.find({ strikes: { $gt: 0 } })
        .sort({ strikes: -1 })
        .lean();
};

export const listUsers = async ({ limit = 100, search = '' } = {}) => {
    const trimmedSearch = (search || '').trim();
    const searchPattern = trimmedSearch ? containsText(trimmedSearch) : null;
    const query = searchPattern
        ? {
              $or: [{ username: searchPattern }, { discordId: searchPattern }],
          }
        : {};

    return await User.find(query)
        .sort('-joinedAt')
        .limit(Math.max(1, Math.min(Number(limit) || 100, 500)))
        .select('discordId username strikes isOnHiatus roles joinedAt')
        .lean();
};
