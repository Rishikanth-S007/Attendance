const router = require('express').Router();
const c = require('../controllers/configController');
const auth = require('../middleware/authMiddleware');
const requireRole = require('../middleware/roleMiddleware');
const validate = require('../middleware/validationMiddleware');
const s = require('../validators/schemas');

router.use(auth);

router.get('/shifts', c.listShifts);
router.post('/shifts', validate(s.createShift), c.createShift);
router.put('/shifts/:id', validate(s.updateShift), c.updateShift);
router.delete('/shifts/:id', c.deleteShift);

router.get('/holidays', validate(s.yearQuery, 'query'), c.listHolidays);
router.post('/holidays', validate(s.createHoliday), c.createHoliday);
router.delete('/holidays/:id', c.deleteHoliday);

router.get('/offices', c.listOffices);
router.post('/offices', validate(s.createOffice), c.createOffice);
router.put('/offices/:id', validate(s.updateOffice), c.updateOffice);
router.delete('/offices/:id', c.deleteOffice);

// Devices hold credentials, so only super admins manage them.
router.get('/devices', requireRole('super_admin'), c.listDevices);
router.post('/devices', requireRole('super_admin'), validate(s.createDevice), c.createDevice);
router.delete('/devices/:id', requireRole('super_admin'), c.revokeDevice);

router.get('/scans', validate(s.scanQuery, 'query'), c.listScans);

module.exports = router;
