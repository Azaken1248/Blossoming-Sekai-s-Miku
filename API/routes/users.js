import express from 'express';
import { listUsers, createUser, getUser, getUserSummary, addStrike, removeStrike, generateShareCard, getCardImage, updateMikuDescription } from '../controllers/userController.js';

const router = express.Router();

router.get('/', listUsers);
router.post('/', createUser);

router.get('/share/:discordId', generateShareCard);
router.get('/:discordId/card.png', getCardImage);

router.get('/:discordId/summary', getUserSummary);
router.get('/:discordId', getUser);
router.post('/:discordId/strikes/add', addStrike);
router.post('/:discordId/strikes/remove', removeStrike);
router.put('/:discordId/miku-description', updateMikuDescription);

export default router;