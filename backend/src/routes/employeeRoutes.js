const router = require('express').Router();
const c = require('../controllers/employeeController');
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const validate = require('../middleware/validationMiddleware');
const s = require('../validators/schemas');

// Every employee-management route requires an authenticated admin (FR-001).
router.use(auth);

router.get('/', validate(s.employeeListQuery, 'query'), c.list);
router.post('/', validate(s.createEmployee), c.create);
router.get('/:id', c.getOne);
router.put('/:id', validate(s.updateEmployee), c.update);
router.delete('/:id', c.remove); // => deactivate (Rule 9)

// FR-003: Face registration (label = primary | front | left | right)
router.post('/:id/register-face', upload.single('image'), c.registerFace);
router.delete('/:id/face', c.clearFace);

module.exports = router;
