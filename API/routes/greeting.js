import express from 'express';

const router = express.Router();

router.get('/', (req, res) => {
    res.send(`<p>Hello ${req.query.name}</p>`);
});

export default router;
