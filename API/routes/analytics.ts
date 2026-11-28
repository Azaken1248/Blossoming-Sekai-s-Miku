import express from 'express';
import {
    getFilteredAssignments,
    getAssignmentStats,
    getUsersWithAssignments,
} from '../controllers/analyticsController.ts';

const router = express.Router();

router.get('/assignments', getFilteredAssignments);
router.get('/users', getUsersWithAssignments);
router.get('/stats', getAssignmentStats);

export default router;
