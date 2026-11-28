import express from 'express';
import { getCardImage, getRedirectPage } from '../controllers/cardController.ts';
import { addStrike, createUser, removeStrike } from '../controllers/memberWrites.ts';
import { getUser, getUserSummary, listUsers } from '../controllers/userController.ts';
import { requireApiKey } from '../middleware/requireApiKey.ts';

const router = express.Router();

router.get('/', listUsers);
router.post('/', requireApiKey, createUser);

router.get('/share/:discordId', getRedirectPage);
router.get('/:discordId/card.png', getCardImage);

router.get('/:discordId/summary', getUserSummary);
router.get('/:discordId', getUser);
router.post('/:discordId/strikes/add', requireApiKey, addStrike);
router.post('/:discordId/strikes/remove', requireApiKey, removeStrike);

export default router;
