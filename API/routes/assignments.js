import express from 'express';
import { 
    createAssignment, 
    completeAssignment, 
    extendAssignment, 
    getPendingTask, 
    getOverdueTasks 
} from '../controllers/assignmentController.js';

import { requireApiKey } from '../middleware/requireApiKey.js';

const router = express.Router();

router.post('/', requireApiKey, createAssignment);
router.post('/:taskId/complete', requireApiKey, completeAssignment);
router.post('/:taskId/extend', requireApiKey, extendAssignment);
router.get('/pending/:discordUserId', getPendingTask);
router.get('/overdue', getOverdueTasks);

export default router;