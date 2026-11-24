import express from 'express';
import {
    listUsers,
    createUser,
    getUser,
    getUserSummary,
    addStrike,
    removeStrike,
    generateShareCard,
    getCardImage,
} from '../controllers/userController.js';

import { requireApiKey } from '../middleware/requireApiKey.js';

const router = express.Router();

router.get('/', listUsers);
router.post('/', requireApiKey, createUser);

router.get('/share/:discordId', generateShareCard);
router.get('/:discordId/card.png', getCardImage);

router.get('/:discordId/summary', getUserSummary);
router.get('/:discordId', getUser);
router.post('/:discordId/strikes/add', requireApiKey, addStrike);
router.post('/:discordId/strikes/remove', requireApiKey, removeStrike);

export default router;
