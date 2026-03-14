import express from 'express';
import { createUser, getUser, addStrike, removeStrike } from '../controllers/userController.js';

const router = express.Router();

router.post('/', createUser);
router.get('/:discordId', getUser);
router.post('/:discordId/strikes/add', addStrike);
router.post('/:discordId/strikes/remove', removeStrike);

export default router;