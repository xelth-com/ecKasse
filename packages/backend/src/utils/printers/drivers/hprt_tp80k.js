/**
 * Driver module for the HPRT TP80K.
 * Implements the standard interface required by the core controller.
 */
module.exports = {
  // --- Identity Information ---
  modelName: 'HPRT_TP80K',
  manufacturer: 'HPRT',

  // --- Default Configuration ---
  getDefaultLanConfig: () => ({
    ip: '192.168.0.31',
    cashRegisterTempIp: '192.168.0.100',
    subnet: '255.255.255.0'
  }),
  
  /**
   * Identifies the printer by sending a standard ESC/POS command.
   * @param {object} port - The port object (LAN, COM, or USB).
   * @returns {Promise<boolean>} - True if the response matches the model.
   */
  identify: async (port) => {
    console.log(`[HPRT Module] Identifying device at ${port.type}:${port.ip || port.path}...`);
    
    try {
      // Get system tools for printer identification
      const systemTools = require('../system_tools');
      const identityResult = await systemTools.getPrinterIdentity(port);
      
      console.log(`[HPRT Module] Received identity result:`, identityResult);
      
      // Handle the new status object format
      if (identityResult.status === 'SUCCESS') {
        // Check if the response contains HPRT manufacturer identifier
        const isHPRT = identityResult.data.toUpperCase().includes('HPRT');
        
        if (isHPRT) {
          console.log(`[HPRT Module] ✅ Device identified as HPRT printer`);
          return true;
        } else {
          console.log(`[HPRT Module] ❌ Device is not an HPRT printer`);
          return false;
        }
      } else if (identityResult.status === 'NO_RESPONSE') {
        // If no response, return true as a best-effort guess
        console.log(`[HPRT Module] ⚠️ No response from device, assuming HPRT printer (best-effort guess)`);
        return true;
      } else {
        // Error case
        console.log(`[HPRT Module] ❌ Identification failed: ${identityResult.message || 'Unknown error'}`);
        return false;
      }
      
    } catch (error) {
      console.log(`[HPRT Module] ❌ Identification failed: ${error.message}`);
      return false;
    }
  },

  // --- Configuration Methods ---
  /**
   * Constructs the binary command to set the printer's IP address.
   * @param {string} newIp - The target IP address.
   * @returns {Buffer} - The command as a binary buffer.
   */
  getSetIpCommand: (newIp) => {
    // The specific system command for this model
    const setIpPrefix = Buffer.from([0x1F, 0x1B, 0x1F, 0x91, 0x00, 0x49, 0x50]);
    const ipBytes = Buffer.from(newIp.split('.').map(num => parseInt(num, 10)));
    return Buffer.concat([setIpPrefix, ipBytes]);
  },
  
  // Returns the required delay in ms for the printer to restart after IP change.
  getRestartDelay: () => 15000
};