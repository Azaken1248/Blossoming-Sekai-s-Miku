import express from 'express';
import { 
    createAssignment, 
    completeAssignment, 
    extendAssignment, 
    getPendingTask, 
    getOverdueTasks 
} from '../controllers/assignmentController.js';

const router = express.Router();

router.post('/', createAssignment);
router.post('/:taskId/complete', completeAssignment);
router.post('/:taskId/extend', extendAssignment);
router.get('/pending/:discordUserId', getPendingTask);
router.get('/overdue', getOverdueTasks);

export default router;