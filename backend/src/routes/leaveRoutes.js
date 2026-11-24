const router = require('express').Router();
const c = require('../controllers/leaveController');
const auth = require('../middleware/authMiddleware');
const deviceAuth = require('../middleware/deviceAuth');
const upload = require('../middleware/uploadMiddleware');
const validate = require('../middleware/validationMiddleware');
const s = require('../validators/schemas');

// Employee app: face-identified, device-paired.
router.post('/app/request', deviceAuth, upload.single('image'), validate(s.leaveFromApp), c.appRequest);
router.post('/app/balance', deviceAuth, upload.single('image'), c.appBalance);

// Admin.
router.get('/', auth, validate(s.leaveListQuery, 'query'), c.list);
router.post('/', auth, validate(s.createLeave), c.create);
router.get('/balance/:employeeId', auth, validate(s.yearQuery, 'query'), c.balance);
router.patch('/:id/decision', auth, validate(s.leaveDecision), c.decide);
router.post('/:id/cancel', auth, c.cancel);

module.exports = router;
