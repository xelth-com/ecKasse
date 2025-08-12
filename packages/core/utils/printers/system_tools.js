const { exec } = require('child_process');
const os = require('os');
const tcpPing = require('tcp-ping');
const { Address4 } = require('ip-address');
const usb = require('usb');
const USB = require('@node-escpos/usb-adapter');

/**
 * Known USB printer devices by vendor/product ID combinations.
 * These are common thermal receipt printers that support ESC/POS commands.
 */
const KNOWN_USB_PRINTERS = [
  { vendorId: 0x04b8, productId: 0x0202, name: 'Epson TM-T20' },
  { vendorId: 0x04b8, productId: 0x0e15, name: 'Epson TM-T88V' },
  { vendorId: 0x154f, productId: 0x154f, name: 'Xprinter XP-58/80 Series' },
  { vendorId: 0x0525, productId: 0xa700, name: 'HPRT TP Series' },
  { vendorId: 0x20d1, productId: 0x7008, name: 'Generic Thermal Printer' }
];

/**
 * A collection of low-level system tools for printer discovery and configuration.
 * NOTE: These are placeholders and require platform-specific implementation and administrative rights.
 */
const systemTools = {
  /**
   * Scans all local networks for devices responding on the standard RAW printing port (9100).
   * @param {string} [networkRange] - Optional CIDR network range to scan (e.g., '192.168.0.0/24')
   * @returns {Promise<string[]>} A list of IP addresses.
   */
  discover_printers: async (networkRange) => {
    if (networkRange) {
      console.log(`[SystemTools] Scanning specified network range: ${networkRange}`);
    } else {
      console.log('[SystemTools] Scanning all local networks for printers on port 9100...');
    }
    
    try {
      let networksToScan = [];
      
      if (networkRange) {
        // Manual network range specified
        try {
          const manualNetwork = new Address4(networkRange);
          networksToScan.push({
            name: 'manual',
            address: manualNetwork.address,
            networkRange: networkRange,
            isManual: true
          });
          console.log(`[SystemTools] Using manual network range: ${networkRange}`);
        } catch (error) {
          console.error(`[SystemTools] Invalid network range '${networkRange}': ${error.message}`);
          return [];
        }
      } else {
        // Auto-detect network interfaces
        const networkInterfaces = os.networkInterfaces();
        const activeInterfaces = [];
        
        // Find all active network interfaces (exclude loopback and inactive interfaces)
        for (const [name, interfaces] of Object.entries(networkInterfaces)) {
          for (const iface of interfaces) {
            if (!iface.internal && iface.family === 'IPv4' && iface.address !== '127.0.0.1') {
              activeInterfaces.push({
                name,
                address: iface.address,
                netmask: iface.netmask,
                isManual: false
              });
            }
          }
        }
        
        if (activeInterfaces.length === 0) {
          console.log('[SystemTools] No active network interfaces found');
          return [];
        }
        
        console.log(`[SystemTools] Found ${activeInterfaces.length} network interface(s) to scan:`);
        activeInterfaces.forEach(iface => {
          console.log(`  - ${iface.name}: ${iface.address}/${iface.netmask}`);
        });
        
        networksToScan = activeInterfaces;
      }
      
      // Scan all networks in parallel
      const networkScanPromises = networksToScan.map(async (iface) => {
        try {
          let address, startAddress, endAddress;
          
          if (iface.isManual) {
            console.log(`[SystemTools] Starting scan on manual range: ${iface.networkRange}...`);
            address = new Address4(iface.networkRange);
            startAddress = address.startAddress();
            endAddress = address.endAddress();
          } else {
            console.log(`[SystemTools] Starting scan on ${iface.name} (${iface.address}/${iface.netmask})...`);
            
            // Convert netmask to CIDR notation
            const cidrBits = iface.netmask.split('.').map(part => {
              return parseInt(part, 10).toString(2);
            }).join('').split('1').length - 1;
            
            address = new Address4(`${iface.address}/${cidrBits}`);
            startAddress = address.startAddress();
            endAddress = address.endAddress();
          }
          
          // Generate list of IP addresses to scan for this interface/range
          const ipsToScan = [];
          
          // For efficiency, limit scans to reasonable ranges
          let scanStartAddress, scanEndAddress;
          
          if (iface.isManual) {
            // Manual range: use the full specified range
            scanStartAddress = startAddress;
            scanEndAddress = endAddress;
          } else {
            // Auto-detected interface: limit to /24 or smaller
            const cidrBits = address.subnetMask;
            if (cidrBits >= 24) {
              // Subnet is /24 or smaller, scan the whole range
              scanStartAddress = startAddress;
              scanEndAddress = endAddress;
            } else {
              // Subnet is larger than /24, scan only our /24 segment
              const ourIpParts = iface.address.split('.').map(n => parseInt(n, 10));
              const networkBase = `${ourIpParts[0]}.${ourIpParts[1]}.${ourIpParts[2]}`;
              scanStartAddress = new Address4(`${networkBase}.1`);
              scanEndAddress = new Address4(`${networkBase}.254`);
              console.log(`[SystemTools] Large subnet detected, limiting scan to ${networkBase}.1-254`);
            }
          }
          
          // Convert IP addresses to integer for iteration
          const ipToInt = (ip) => {
            return ip.split('.').reduce((int, octet) => (int << 8) + parseInt(octet, 10), 0) >>> 0;
          };
          
          const intToIp = (int) => {
            return [
              (int >>> 24) & 255,
              (int >>> 16) & 255, 
              (int >>> 8) & 255,
              int & 255
            ].join('.');
          };
          
          const startInt = ipToInt(scanStartAddress.correctForm());
          const endInt = ipToInt(scanEndAddress.correctForm());
          const ourInt = iface.isManual ? 0 : ipToInt(iface.address);
          
          // Generate IPs to scan (skip network, broadcast, and our own IP if auto-detected)
          for (let ipInt = startInt + 1; ipInt < endInt; ipInt++) {
            if (iface.isManual || ipInt !== ourInt) {
              ipsToScan.push(intToIp(ipInt));
            }
          }
          
          console.log(`[SystemTools] Scanning ${ipsToScan.length} IP addresses on ${iface.name}...`);
          
          // Perform TCP ping on port 9100 for all IPs in parallel
          const scanPromises = ipsToScan.map(ip => {
            return new Promise((resolve) => {
              tcpPing.ping({ 
                address: ip, 
                port: 9100, 
                timeout: 1000,
                attempts: 1
              }, (error, data) => {
                // Fix: Check for successful connection with valid response time
                if (!error && data && typeof data.avg === 'number' && data.avg >= 0) {
                  console.log(`[SystemTools] Found potential printer at ${ip} on ${iface.name} (response time: ${data.avg}ms)`);
                  resolve(ip);
                } else {
                  resolve(null);
                }
              });
            });
          });
          
          // Wait for all scans on this interface to complete
          const results = await Promise.all(scanPromises);
          const foundPrinters = results.filter(ip => ip !== null);
          
          console.log(`[SystemTools] Interface ${iface.name} scan complete. Found ${foundPrinters.length} potential printers: [${foundPrinters.join(', ')}]`);
          return foundPrinters;
          
        } catch (interfaceError) {
          console.error(`[SystemTools] Error scanning interface ${iface.name}:`, interfaceError.message);
          return [];
        }
      });
      
      // Wait for all network scans to complete
      const networkResults = await Promise.all(networkScanPromises);
      
      // Flatten and deduplicate results from all networks
      const allPrinters = networkResults.flat();
      const uniquePrinters = [...new Set(allPrinters)]; // Remove duplicates
      
      console.log(`[SystemTools] Multi-network scan complete. Found ${uniquePrinters.length} unique potential printers: [${uniquePrinters.join(', ')}]`);
      return uniquePrinters;
      
    } catch (error) {
      console.error('[SystemTools] Error during multi-network printer discovery:', error);
      return [];
    }
  },

  /**
   * Manages the local machine's IP address.
   * @param {object} options - The action to perform ('get', 'set', 'restore').
   * @returns {Promise<object>}
   */
  manage_local_ip: async (options) => {
    console.log(`[SystemTools] STUB: Managing local IP with action: ${options.action}`);
    // Requires platform-specific commands (netsh, ip) and administrative privileges.
    // This is a highly complex and sensitive operation.
    if (options.action === 'get') {
        return Promise.resolve({ ip: '192.168.1.10', subnet: '255.255.255.0' });
    }
    return Promise.resolve({ status: 'success' });
  },

  /**
   * Sends a raw binary command to a specific printer port.
   * @param {object} port - The port to send the command to.
   * @param {Buffer} command - The binary command buffer.
   * @param {number} timeout - Connection timeout in milliseconds (default: 5000)
   */
  execute_printer_command: async (port, command, timeout = 5000) => {
    if (port.type === 'LAN') {
      return new Promise((resolve, reject) => {
        const net = require('net');
        const socket = new net.Socket();
        
        console.log(`[SystemTools] Connecting to printer at ${port.ip}:9100...`);
        
        let isConnected = false;
        let dataBuffer = Buffer.alloc(0);
        
        const cleanup = () => {
          if (socket && !socket.destroyed) {
            socket.destroy();
          }
        };
        
        const connectionTimeout = setTimeout(() => {
          if (!isConnected) {
            console.log(`[SystemTools] Connection timeout after ${timeout}ms`);
            cleanup();
            resolve({ status: 'timeout', message: `Connection timeout to ${port.ip}` });
          }
        }, timeout);
        
        socket.on('connect', () => {
          isConnected = true;
          clearTimeout(connectionTimeout);
          console.log(`[SystemTools] Connected to printer at ${port.ip}`);
          
          try {
            console.log(`[SystemTools] Sending ${command.length} bytes to printer...`);
            socket.write(command);
            
            // Set a timeout for receiving response (printers usually respond quickly)
            const responseTimeout = setTimeout(() => {
              console.log(`[SystemTools] Command sent successfully, closing connection`);
              cleanup();
              resolve({ 
                status: 'success', 
                message: `Command sent to ${port.ip}`,
                bytesSent: command.length
              });
            }, 1000); // Wait 1 second for any response, then consider success
            
          } catch (writeError) {
            clearTimeout(responseTimeout);
            console.error(`[SystemTools] Error sending command: ${writeError.message}`);
            cleanup();
            resolve({ status: 'error', message: `Write error: ${writeError.message}` });
          }
        });
        
        socket.on('data', (data) => {
          dataBuffer = Buffer.concat([dataBuffer, data]);
          console.log(`[SystemTools] Received ${data.length} bytes from printer`);
        });
        
        socket.on('error', (error) => {
          clearTimeout(connectionTimeout);
          console.error(`[SystemTools] Socket error: ${error.message}`);
          cleanup();
          resolve({ status: 'error', message: `Socket error: ${error.message}` });
        });
        
        socket.on('close', () => {
          console.log(`[SystemTools] Connection to ${port.ip} closed`);
          if (isConnected) {
            resolve({ 
              status: 'success', 
              message: `Command completed, connection closed`,
              bytesSent: command.length,
              responseData: dataBuffer
            });
          }
        });
        
        try {
          socket.connect(9100, port.ip);
        } catch (connectError) {
          clearTimeout(connectionTimeout);
          console.error(`[SystemTools] Connection error: ${connectError.message}`);
          resolve({ status: 'error', message: `Connection error: ${connectError.message}` });
        }
      });
      
    } else if (port.type === 'USB') {
      // USB implementation
      return new Promise((resolve) => {
        if (!port.device) {
          resolve({ status: 'error', message: 'USB device not available' });
          return;
        }
        
        console.log(`[SystemTools] Sending ${command.length} bytes to USB printer...`);
        
        try {
          port.device.write(command, (error) => {
            if (error) {
              console.error(`[SystemTools] USB write error: ${error.message}`);
              resolve({ status: 'error', message: `USB write error: ${error.message}` });
            } else {
              console.log(`[SystemTools] USB command sent successfully`);
              resolve({ 
                status: 'success', 
                message: 'USB command sent successfully',
                bytesSent: command.length
              });
            }
          });
        } catch (usbError) {
          console.error(`[SystemTools] USB error: ${usbError.message}`);
          resolve({ status: 'error', message: `USB error: ${usbError.message}` });
        }
      });
      
    } else {
      return Promise.resolve({ 
        status: 'error', 
        message: `Unsupported port type: ${port.type}` 
      });
    }
  },

  /**
   * A convenience wrapper around execute_printer_command for sending a test print.
   */
  send_test_print: async (port) => {
    const testMessage = 'Test Print Success!\n\n';
    const command = Buffer.from(testMessage);
    console.log(`[SystemTools] STUB: Sending test print to ${port.ip}`);
    return systemTools.execute_printer_command(port, command);
  },

  /**
   * Discovers and configures USB-connected printers as a fallback method.
   * This function scans for known USB printer devices, identifies them using driver modules,
   * and attempts to configure them for network access.
   * @param {Array} printerModules - Array of loaded printer driver modules for identification
   * @returns {Promise<Object|null>} Found and configured printer object or null
   */
  findAndConfigureUSBPrinter: async (printerModules) => {
    console.log('[SystemTools] Starting USB printer discovery...');
    
    try {
      // Get list of connected USB devices
      const devices = usb.getDeviceList();
      console.log(`[SystemTools] Found ${devices.length} USB devices`);
      
      // Filter for known printer devices
      const printerDevices = devices.filter(device => {
        const descriptor = device.deviceDescriptor;
        return KNOWN_USB_PRINTERS.some(printer => 
          printer.vendorId === descriptor.idVendor && 
          printer.productId === descriptor.idProduct
        );
      });
      
      if (printerDevices.length === 0) {
        console.log('[SystemTools] No known USB printers found');
        return null;
      }
      
      console.log(`[SystemTools] Found ${printerDevices.length} USB printer(s)`);
      
      // Try to connect to and identify the first printer found
      for (const usbDevice of printerDevices) {
        try {
          const descriptor = usbDevice.deviceDescriptor;
          const knownPrinter = KNOWN_USB_PRINTERS.find(p => 
            p.vendorId === descriptor.idVendor && p.productId === descriptor.idProduct
          );
          
          console.log(`[SystemTools] Attempting to connect to ${knownPrinter.name}...`);
          
          // Create USB adapter for ESC/POS communication
          const device = new USB(descriptor.idVendor, descriptor.idProduct);
          await new Promise((resolve, reject) => {
            device.open((error) => {
              if (error) {
                reject(new Error(`Failed to open USB device: ${error.message}`));
              } else {
                resolve();
              }
            });
          });
          
          console.log('[SystemTools] USB device opened successfully');
          
          // Try to identify the printer using driver modules
          const usbPort = { type: 'USB', device, vendorId: descriptor.idVendor, productId: descriptor.idProduct };
          
          for (const module of printerModules) {
            try {
              console.log(`[SystemTools] Testing identification with ${module.modelName} driver...`);
              if (await module.identify(usbPort)) {
                console.log(`[SystemTools] Printer identified as ${module.modelName}`);
                
                // Send network configuration via USB
                console.log('[SystemTools] Configuring printer network settings via USB...');
                const targetIp = '192.168.1.250';
                const setIpCommand = module.getSetIpCommand(targetIp);
                
                // Send the IP configuration command via USB
                await new Promise((resolve, reject) => {
                  device.write(setIpCommand, (error) => {
                    if (error) {
                      reject(new Error(`Failed to send configuration: ${error.message}`));
                    } else {
                      console.log('[SystemTools] Network configuration sent successfully');
                      resolve();
                    }
                  });
                });
                
                // Close USB connection
                device.close();
                
                // Wait for printer to restart and configure network
                console.log(`[SystemTools] Waiting for printer restart (${module.getRestartDelay()}ms)...`);
                await new Promise(resolve => setTimeout(resolve, module.getRestartDelay()));
                
                // Test network connectivity
                const networkPort = { type: 'LAN', ip: targetIp };
                try {
                  await systemTools.send_test_print(networkPort);
                  console.log('[SystemTools] ✅ USB printer successfully configured for network access');
                  
                  return {
                    module,
                    port: networkPort,
                    configuredViaUsb: true,
                    usbInfo: {
                      vendorId: descriptor.idVendor,
                      productId: descriptor.idProduct,
                      name: knownPrinter.name
                    }
                  };
                } catch (networkError) {
                  console.log('[SystemTools] Network test failed, but printer may still be configured');
                  return {
                    module,
                    port: networkPort,
                    configuredViaUsb: true,
                    networkTestFailed: true,
                    usbInfo: {
                      vendorId: descriptor.idVendor,
                      productId: descriptor.idProduct,
                      name: knownPrinter.name
                    }
                  };
                }
              }
            } catch (identifyError) {
              console.log(`[SystemTools] Identification failed with ${module.modelName}: ${identifyError.message}`);
            }
          }
          
          // Close device if no module could identify it
          device.close();
          console.log(`[SystemTools] Could not identify ${knownPrinter.name} with available drivers`);
          
        } catch (deviceError) {
          console.error(`[SystemTools] Error with USB device: ${deviceError.message}`);
        }
      }
      
      console.log('[SystemTools] ❌ No USB printers could be configured');
      return null;
      
    } catch (error) {
      console.error('[SystemTools] USB discovery error:', error.message);
      return null;
    }
  },

  /**
   * Queries a printer device to get its identity information using a robust two-step approach.
   * First attempts "GS I 1", then falls back to "DLE EOT 1" if needed.
   * @param {object} port - The port object (LAN, COM, or USB).
   * @returns {Promise<object>} Status object: {status: 'SUCCESS'|'NO_RESPONSE'|'ERROR', data: string, message?: string}
   */
  getPrinterIdentity: async (port) => {
    const attemptIdentification = (socket, command, commandName, timeout = 2000) => {
      return new Promise((resolve) => {
        let responseData = '';
        let timeoutHandle;
        
        console.log(`[SystemTools] Sending ${commandName} command: [${command.map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}]`);
        
        const cleanup = () => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          socket.removeAllListeners('data');
        };
        
        timeoutHandle = setTimeout(() => {
          cleanup();
          console.log(`[SystemTools] ${commandName} command timed out after ${timeout}ms`);
          resolve({ status: 'TIMEOUT' });
        }, timeout);
        
        socket.on('data', (data) => {
          responseData += data.toString('ascii');
          console.log(`[SystemTools] Received data (${data.length} bytes): [${Array.from(data).map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}]`);
          console.log(`[SystemTools] ASCII interpretation: "${responseData}"`);
          
          // Check if we have a complete response (sufficient data or null terminator)
          if (responseData.length >= 5 || responseData.includes('\0') || responseData.includes('\n')) {
            cleanup();
            resolve({ status: 'SUCCESS', data: responseData.trim() });
          }
        });
        
        try {
          socket.write(Buffer.from(command));
          console.log(`[SystemTools] ${commandName} command sent successfully`);
        } catch (error) {
          cleanup();
          resolve({ status: 'ERROR', message: `Failed to send ${commandName} command: ${error.message}` });
        }
      });
    };

    if (port.type === 'USB') {
      // USB implementation
      if (!port.device) {
        return { status: 'ERROR', message: 'USB device not available' };
      }

      console.log(`[SystemTools] Starting USB printer identification...`);
      
      // Step 1: Try GS I 1 command
      let result = await attemptIdentification(port.device, [0x1D, 0x49, 0x01], 'GS I 1');
      
      if (result.status === 'SUCCESS') {
        return result;
      }
      
      // Step 2: Try DLE EOT 1 command
      console.log(`[SystemTools] GS I 1 failed, trying DLE EOT 1 fallback...`);
      result = await attemptIdentification(port.device, [0x10, 0x04, 0x01], 'DLE EOT 1');
      
      if (result.status === 'SUCCESS') {
        return result;
      }
      
      console.log(`[SystemTools] Both identification commands failed for USB device`);
      return { status: 'NO_RESPONSE', message: 'No response from USB device' };
      
    } else if (port.type === 'LAN') {
      // Network implementation
      return new Promise((resolve) => {
        const net = require('net');
        const socket = new net.Socket();
        
        console.log(`[SystemTools] Starting network printer identification at ${port.ip}:9100...`);
        
        const handleConnection = async () => {
          console.log(`[SystemTools] Connected to printer at ${port.ip} for identification`);
          
          // Step 1: Try GS I 1 command
          let result = await attemptIdentification(socket, [0x1D, 0x49, 0x01], 'GS I 1');
          
          if (result.status === 'SUCCESS') {
            socket.destroy();
            resolve(result);
            return;
          }
          
          // Step 2: Try DLE EOT 1 command
          console.log(`[SystemTools] GS I 1 failed, trying DLE EOT 1 fallback...`);
          result = await attemptIdentification(socket, [0x10, 0x04, 0x01], 'DLE EOT 1');
          
          socket.destroy();
          
          if (result.status === 'SUCCESS') {
            resolve(result);
          } else {
            console.log(`[SystemTools] Both identification commands failed for ${port.ip}`);
            resolve({ status: 'NO_RESPONSE', message: `No response from network printer at ${port.ip}` });
          }
        };
        
        socket.connect(9100, port.ip, handleConnection);
        
        socket.on('error', (error) => {
          console.log(`[SystemTools] Network connection error to ${port.ip}: ${error.message}`);
          resolve({ status: 'ERROR', message: `Network connection error: ${error.message}` });
        });
      });
      
    } else {
      return { status: 'ERROR', message: `Unsupported port type: ${port.type}` };
    }
  }
};

module.exports = systemTools;