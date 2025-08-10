/**
 * Driver module for the Xprinter XP-V330L.
 * Implements the standard interface required by the core controller.
 */
module.exports = {
  // --- Identity Information ---
  modelName: 'XPRINTER_XP-V330L',
  manufacturer: 'Xprinter',

  // --- Default Configuration ---
  getDefaultLanConfig: () => ({
    ip: '192.168.123.100',
    cashRegisterTempIp: '192.168.123.101',
    subnet: '255.255.255.0'
  }),
  
  /**
   * Identifies the printer by sending a standard ESC/POS command.
   * @param {object} port - The port object (LAN, COM, or USB).
   * @returns {Promise<boolean>} - True if the response matches the model.
   */
  identify: async (port) => {
    console.log(`[Xprinter Module] Identifying device at ${port.type}:${port.ip || port.path}...`);
    
    try {
      // Get system tools for printer identification
      const systemTools = require('../system_tools');
      const identityResult = await systemTools.getPrinterIdentity(port);
      
      console.log(`[Xprinter Module] Received identity result:`, identityResult);
      
      // Handle the new status object format
      if (identityResult.status === 'SUCCESS') {
        // Check if the response contains Xprinter manufacturer identifier
        const isXprinter = identityResult.data.toUpperCase().includes('XPRINTER') || 
                          identityResult.data.toUpperCase().includes('XP-');
        
        if (isXprinter) {
          console.log(`[Xprinter Module] ✅ Device identified as Xprinter`);
          return true;
        } else {
          console.log(`[Xprinter Module] ❌ Device is not an Xprinter`);
          return false;
        }
      } else if (identityResult.status === 'NO_RESPONSE') {
        // If no response, return true as a best-effort guess
        console.log(`[Xprinter Module] ⚠️ No response from device, assuming Xprinter (best-effort guess)`);
        return true;
      } else {
        // Error case
        console.log(`[Xprinter Module] ❌ Identification failed: ${identityResult.message || 'Unknown error'}`);
        return false;
      }
      
    } catch (error) {
      console.log(`[Xprinter Module] ❌ Identification failed: ${error.message}`);
      return false;
    }
  },

  // --- Configuration Methods ---
  /**
   * Constructs the binary command to set the printer's IP address.
   * @param {string} newIp - The target IP address, e.g., '192.168.1.250'.
   * @returns {Buffer} - The command as a binary buffer.
   */
  getSetIpCommand: (newIp) => {
    // This is the specific, non-documented command for this model
    const setIpPrefix = Buffer.from([0x1F, 0x1B, 0x1F, 0x91, 0x00, 0x53, 0x45, 0x54, 0x20, 0x49, 0x50]); 
    const ipBytes = Buffer.from(newIp.split('.').map(num => parseInt(num, 10)));
    return Buffer.concat([setIpPrefix, ipBytes]);
  },
  
  // Returns the required delay in ms for the printer to restart after IP change.
  getRestartDelay: () => 15000 
};