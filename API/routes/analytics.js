import express from 'express';
import { getFilteredAssignments, getAssignmentStats, getUsersWithAssignments } from '../controllers/analyticsController.js';

const router = express.Router();

router.get('/assignments', getFilteredAssignments);
router.get('/users', getUsersWithAssignments);
router.get('/stats', getAssignmentStats);

export default router;