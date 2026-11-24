const router = require('express').Router();
const c = require('../controllers/reportController');
const auth = require('../middleware/authMiddleware');
const validate = require('../middleware/validationMiddleware');
const s = require('../validators/schemas');

router.use(auth);
// ?format=json|csv|xlsx|pdf  &startDate &endDate &employeeId &department
router.get('/attendance', validate(s.reportQuery, 'query'), c.attendanceReport); // daily register
router.get('/summary', validate(s.reportQuery, 'query'), c.summaryReport); // per-employee totals

module.exports = router;
