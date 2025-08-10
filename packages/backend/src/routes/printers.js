const express = require('express');
const router = express.Router();
const printerService = require('../services/printer_service');

/**
 * @route   POST /api/printers/discover
 * @desc    Starts the printer auto-discovery and configuration process.
 * @access  Public
 */
router.post('/discover', async (req, res) => {
  console.log('API call received to discover printers...');
  try {
    // The networkRange can be optionally passed in the request body for manual scans
    const options = req.body || {}; 

    // We don't wait for this to finish, as it can be a long process.
    // We'll return an immediate response to the client.
    // The client can poll for results or use WebSockets for real-time updates.
    printerService.startAutoConfiguration(options);

    res.status(202).json({ message: 'Printer discovery process started.' });

  } catch (error) {
    console.error('Error starting printer discovery:', error);
    res.status(500).json({ message: 'Failed to start printer discovery process.' });
  }
});

/**
 * @route   GET /api/printers
 * @desc    Gets the list of currently configured printers.
 * @access  Public
 */
router.get('/', (req, res) => {
  res.json(printerService.printers);
});

module.exports = router;