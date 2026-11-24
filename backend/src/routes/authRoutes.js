const router = require('express').Router();
const c = require('../controllers/authController');
const auth = require('../middleware/authMiddleware');
const requireRole = require('../middleware/roleMiddleware');
const validate = require('../middleware/validationMiddleware');
const s = require('../validators/schemas');

router.post('/login', validate(s.login), c.login);
router.post('/setup-first-admin', validate(s.createAdmin), c.registerFirstAdmin); // one-time bootstrap, needs SETUP_TOKEN
router.get('/me', auth, c.me);
router.post('/change-password', auth, validate(s.changePassword), c.changePassword);
router.post('/admins', auth, requireRole('super_admin'), validate(s.createAdmin), c.createAdmin);

module.exports = router;
