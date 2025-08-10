/**
 * Core controller for the printer auto-configuration system.
 * Implements a multi-layered discovery strategy and delegates model-specific tasks to driver modules.
 */
class CoreController {
  constructor(printerModules, tools, printerService, options = {}) {
    this.modules = printerModules; // Array of loaded printer driver modules
    this.tools = tools;           // API object for system tools
    this.printerService = printerService; // Printer service for configuration persistence
    this.options = options;       // Configuration options (networkRange, etc.)
    this.foundPrinter = null;
  }

  /**
   * Main method to start the entire configuration process.
   */
  async startConfiguration() {
    console.log('🚀 Starting printer auto-configuration process...');

    // Step 1: Search on the local network (DHCP)
    let printer = await this.findInLocalLan();
    if (printer) {
      this.foundPrinter = printer;
      console.log(`✅ Printer found via DHCP: ${printer.module.modelName} at ${printer.port.ip}`);
      return this.finalizeConfiguration();
    }
    
    // Step 2: Search for known default static IPs
    printer = await this.findByDefaultLan();
    if (printer) {
      this.foundPrinter = printer;
       console.log(`✅ Printer found by default static IP: ${printer.module.modelName} at ${printer.port.ip}`);
       return this.finalizeConfiguration();
    }
    
    // Step 3: Search on COM ports (to be implemented in future)
    
    // Step 4: Search and configure via USB connection (final fallback)
    console.log('🔌 Attempting USB printer discovery and configuration...');
    printer = await this.tools.findAndConfigureUSBPrinter(this.modules);
    if (printer) {
      this.foundPrinter = printer;
      console.log(`✅ Printer configured via USB: ${printer.module.modelName}`);
      if (printer.configuredViaUsb) {
        console.log(`📡 USB printer has been configured for network access at ${printer.port.ip}`);
      }
      return this.finalizeConfiguration();
    }

    console.log('❌ Could not find a supported printer using automatic methods.');
    console.log('💡 Please check that a compatible printer is connected via USB or network.');
  }

  /**
   * Discovers printers on the local LAN that may have a DHCP-assigned IP.
   */
  async findInLocalLan() {
    const discoveredIps = await this.tools.discover_printers(this.options.networkRange);
    for (const ip of discoveredIps) {
      for (const module of this.modules) {
        const port = { type: 'LAN', ip: ip };
        if (await module.identify(port)) {
          return { module, port }; // Found and identified!
        }
      }
    }
    return null;
  }

  /**
   * Searches for printers using their factory-default static IP addresses.
   */
  async findByDefaultLan() {
    const originalIpConfig = await this.tools.manage_local_ip({ action: 'get' });
    
    for (const module of this.modules) {
      const defaultConfig = module.getDefaultLanConfig();
      if (!defaultConfig) continue; // Module does not have a default static IP

      // Temporarily switch the cash register's IP to the printer's subnet
      await this.tools.manage_local_ip({ 
        action: 'set', 
        ip: defaultConfig.cashRegisterTempIp,
        subnet: defaultConfig.subnet
      });

      const port = { type: 'LAN', ip: defaultConfig.ip };
      if (await module.identify(port)) {
          // Found it! Restore IP and return the found printer.
          await this.tools.manage_local_ip({ action: 'restore' });
          return { module, port };
      }
      
      // Not found, restore IP and try the next module
      await this.tools.manage_local_ip({ action: 'restore' });
    }
    return null;
  }
  
  /**
   * Final stage: configures the printer's network and runs a test print.
   */
  async finalizeConfiguration() {
      const { module, port } = this.foundPrinter;
      let newIp, finalPort;
      
      // Check if printer was found via DHCP (network discovery)
      const foundViaDhcp = this.foundPrinter.configuredViaUsb !== true && 
                          !this.modules.some(m => m.getDefaultLanConfig()?.ip === port.ip);
      
      if (foundViaDhcp) {
        // For DHCP-found printers, use their existing IP
        newIp = port.ip;
        finalPort = port;
        console.log(`Using existing DHCP IP for configuration: ${newIp}`);
      } else {
        // For static IP or USB-configured printers, set to target IP
        newIp = '192.168.1.250';
        console.log(`Configuring printer to new IP: ${newIp}...`);
        const command = module.getSetIpCommand(newIp);
        await this.tools.execute_printer_command(port, command);
        
        console.log(`Waiting for printer to restart (${module.getRestartDelay()}ms)...`);
        await new Promise(resolve => setTimeout(resolve, module.getRestartDelay()));
        
        finalPort = { type: 'LAN', ip: newIp };
      }
      
      console.log('Printing test receipt...');
      await this.tools.send_test_print(finalPort);
      
      // Save the configured printer to the service
      if (this.printerService) {
        const printerData = {
          model: module.modelName,
          manufacturer: module.manufacturer,
          ip: newIp,
          port: finalPort,
          configuredAt: new Date().toISOString()
        };
        await this.printerService.addPrinter(printerData);
      }
      
      console.log('🎉 Configuration completed successfully!');
  }
}

module.exports = CoreController;