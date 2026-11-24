const router = require('express').Router();
const c = require('../controllers/attendanceController');
const auth = require('../middleware/authMiddleware');
const deviceAuth = require('../middleware/deviceAuth');
const upload = require('../middleware/uploadMiddleware');
const validate = require('../middleware/validationMiddleware');
const s = require('../validators/schemas');

// Employee-facing: employees have no accounts, but the DEVICE must be paired
// (X-Device-Key) and the person is identified purely by their face.
router.post('/verify', deviceAuth, upload.single('image'), c.verify);
router.post('/check-in', deviceAuth, upload.single('image'), c.checkIn);
router.post('/check-out', deviceAuth, upload.single('image'), c.checkOut);

// Admin-facing.
router.get('/', auth, c.list);
router.get('/today', auth, c.today);
router.get('/employee/:employeeId', auth, c.byEmployee);
router.post('/', auth, validate(s.createAttendance), c.create);
router.put('/:id', auth, validate(s.updateAttendance), c.update);

module.exports = router;
