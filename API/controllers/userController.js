import * as userUtils from '../../Utils/DBUtils/userUtils.js';

export const createUser = async (req, res) => {
    try {
        const { discordId, username } = req.body;
        if (!discordId || !username) {
            return res.status(400).json({ error: 'discordId and username are required' });
        }
        const user = await userUtils.findOrCreateUser(discordId, username);
        res.status(201).json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getUser = async (req, res) => {
    try {
        const user = await userUtils.getUserProfile(req.params.discordId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const addStrike = async (req, res) => {
    try {
        const strikes = await userUtils.addStrikeByDiscordId(req.params.discordId);
        if (strikes === null) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ success: true, strikes });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const removeStrike = async (req, res) => {
    try {
        const strikes = await userUtils.removeStrikeByDiscordId(req.params.discordId);
        res.json({ success: true, strikes });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};