const express = require('express');
const { handleGenerateExport } = require('../controllers/export.controller');
const router = express.Router();

router.post('/dsfinvk', async (req, res, next) => {
  try {
    const result = await handleGenerateExport(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;