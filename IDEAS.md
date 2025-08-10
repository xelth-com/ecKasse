# ecKasse Development Ideas & Roadmap

This document outlines future development tasks, improvements, and enhancements for the ecKasse POS system. Items are organized by priority and complexity to help developers choose appropriate tasks.

## Printer Auto-Configuration System - Remaining Tasks

The printer system is functionally complete for network-based discovery and configuration, but several components remain stubbed or require implementation for full production readiness.

### 🔴 High Priority - Core Functionality

#### 1. Real Printer Communication Implementation
**Current Status:** Stubbed in `system_tools.js`
**Location:** `packages/backend/src/utils/printers/system_tools.js`

**Functions to Implement:**
- `execute_printer_command(port, command)` - Currently returns mock success
- `send_test_print(port)` - Currently logs but doesn't actually print

**Requirements:**
```javascript
// Real TCP socket implementation needed
const net = require('net');

async function execute_printer_command(port, command) {
  if (port.type === 'LAN') {
    const socket = new net.Socket();
    return new Promise((resolve, reject) => {
      socket.connect(9100, port.ip, () => {
        socket.write(command, (error) => {
          socket.destroy();
          if (error) reject(error);
          else resolve({ status: 'success' });
        });
      });
      socket.on('error', reject);
    });
  }
  // Add USB and COM implementations
}
```

**Test Plan:**
- Create actual ESC/POS test print commands
- Verify output on real thermal printers
- Handle connection timeouts and errors
- Test with different paper sizes and fonts

#### 2. Local IP Management for Static Discovery
**Current Status:** Stubbed - returns mock data
**Location:** `system_tools.js` - `manage_local_ip(options)`

**Purpose:** 
When searching for printers with default static IPs (like 192.168.123.100), the system needs to temporarily change the local machine's IP to the same subnet to communicate.

**Implementation Requirements:**
- **Windows:** Use `netsh` commands with elevated privileges
- **Linux:** Use `ip` commands with sudo access
- **macOS:** Use `ifconfig` with sudo access

**Example Implementation:**
```javascript
// Windows implementation
async function setWindowsIP(interfaceName, ip, subnet) {
  const { exec } = require('child_process');
  return new Promise((resolve, reject) => {
    const cmd = `netsh interface ip set address "${interfaceName}" static ${ip} ${subnet}`;
    exec(cmd, { shell: 'cmd.exe' }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ status: 'success' });
    });
  });
}
```

**Security Considerations:**
- Requires administrative/root privileges
- Must restore original IP configuration
- Should timeout operations to prevent system lockup
- Consider using network namespaces on Linux for isolation

#### 3. Enhanced USB Printer Support
**Current Status:** Partially implemented, needs testing
**Location:** `system_tools.js` - `findAndConfigureUSBPrinter()`

**Missing Components:**
- Real USB device communication testing
- Error handling for USB permission issues
- Cross-platform USB driver compatibility
- Support for different USB printer classes

**Implementation Tasks:**
1. Test with real USB thermal printers
2. Add Windows USB driver detection
3. Implement proper USB error handling
4. Add support for USB-to-Serial adapters

### 🟡 Medium Priority - Robustness & Features

#### 4. COM Port Discovery and Configuration
**Current Status:** Not implemented (Step 3 in CoreController)
**Location:** `packages/backend/src/utils/printers/core_controller.js`

**Requirements:**
```javascript
async findOnComPorts() {
  // Use serialport library to enumerate COM/ttyUSB ports
  const SerialPort = require('serialport');
  const ports = await SerialPort.list();
  
  // Filter for likely printer ports
  const printerPorts = ports.filter(port => 
    port.manufacturer && 
    (port.manufacturer.includes('FTDI') || 
     port.manufacturer.includes('Prolific') ||
     port.vendorId === '0403') // Common USB-Serial chips
  );
  
  // Test each port with printer identification
  for (const port of printerPorts) {
    // Implement serial communication for ESC/POS commands
  }
}
```

**Dependencies:**
- Add `serialport` npm package
- Handle different baud rates (9600, 19200, 115200)
- Implement serial ESC/POS communication
- Cross-platform serial port permissions

#### 5. Advanced Network Discovery
**Current Status:** Basic TCP ping on port 9100
**Location:** `system_tools.js` - `discover_printers()`

**Enhancements Needed:**
- **Bonjour/mDNS Discovery:** Detect network printers advertising services
- **SNMP Printer Detection:** Query SNMP-enabled printers for model info
- **Broadcast Ping:** Send broadcast packets to discover responsive devices
- **Port Range Scanning:** Check multiple ports (9100, 631, 515) for different protocols

**Implementation:**
```javascript
// mDNS discovery example
const mdns = require('multicast-dns')();
mdns.query({ questions: [{ type: 'PTR', name: '_ipp._tcp.local' }] });
mdns.on('response', (response) => {
  // Parse printer service announcements
});
```

#### 6. Printer Driver Enhancement
**Current Status:** Basic HPRT and Xprinter drivers
**Location:** `packages/backend/src/utils/printers/drivers/`

**Missing Features:**
- **Configuration Validation:** Verify IP changes actually took effect
- **Printer Status Queries:** Check paper, error status before printing  
- **Advanced Commands:** Set printer parameters (density, speed, etc.)
- **Firmware Updates:** Support for printer firmware management

**Additional Printer Support:**
- Epson TM series (very common in POS)
- Star Micronics printers
- Citizen thermal printers
- Generic ESC/POS compatible printers

### 🟢 Low Priority - Polish & Advanced Features

#### 7. Configuration Management UI
**Current Status:** API-only configuration
**Location:** New development needed

**Features:**
- Web-based printer management interface
- Real-time printer status monitoring
- Print queue management
- Configuration backup/restore

#### 8. Print Job Management
**Current Status:** Direct printing only
**Location:** New service needed

**Features:**
- Print queue with retry logic
- Job prioritization and scheduling
- Print job history and auditing
- Batch printing capabilities

#### 9. Advanced Logging and Monitoring
**Current Status:** Basic console logging
**Location:** Throughout printer system

**Enhancements:**
- Structured metrics collection
- Printer performance monitoring
- Health checks and alerting
- Integration with system monitoring tools

### 🔧 Technical Debt & Code Quality

#### 10. Error Handling Standardization
**Current Issues:**
- Inconsistent error response formats
- Missing timeout handling in several functions
- No retry logic for transient failures

**Improvements:**
```javascript
// Standardized error handling
class PrinterError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'PrinterError';
    this.code = code;
    this.details = details;
  }
}

// Consistent timeout wrapper
async function withTimeout(promise, timeoutMs, errorMessage) {
  const timeout = new Promise((_, reject) => 
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
  );
  return Promise.race([promise, timeout]);
}
```

#### 11. Configuration Schema Validation
**Current Status:** No validation on printer configurations
**Location:** `printer_service.js`

**Requirements:**
- JSON Schema validation for configuration files
- Runtime validation of printer parameters
- Migration system for configuration format changes

#### 12. Unit and Integration Testing
**Current Status:** Manual testing script only
**Location:** `packages/backend/src/scripts/test_printers.js`

**Needed Tests:**
- Unit tests for each driver module
- Mock printer server for testing
- Network discovery simulation
- Configuration persistence testing
- Error scenario testing

### 📋 Implementation Priority Guide

**Week 1-2: Core Functionality**
1. Implement real `execute_printer_command` and `send_test_print`
2. Test with actual thermal printers
3. Add proper error handling and timeouts

**Week 3-4: Network Robustness**
1. Implement local IP management for static discovery
2. Add COM port discovery
3. Enhance USB printer support

**Week 5-6: Driver Expansion**
1. Add support for Epson TM series
2. Implement advanced printer commands
3. Add configuration validation

**Week 7-8: Polish & Testing**
1. Comprehensive test suite
2. Configuration management improvements
3. Documentation updates

### 🚀 Quick Start for Contributors

**Easy First Tasks:**
1. Add support for new printer models (copy existing driver pattern)
2. Improve logging messages and error descriptions
3. Add configuration validation rules
4. Write unit tests for existing functions

**Medium Complexity:**
1. Implement COM port discovery
2. Add mDNS/Bonjour printer discovery  
3. Create printer management UI components
4. Implement print job queuing

**Advanced Tasks:**
1. Local IP management with OS-specific commands
2. Real-time printer status monitoring
3. Advanced error recovery mechanisms
4. Performance optimization for large network scans

### 📚 Dependencies to Consider

**New Packages Needed:**
```json
{
  "serialport": "^12.0.0",        // COM port communication
  "multicast-dns": "^7.2.5",      // mDNS printer discovery  
  "node-snmp": "^3.1.1",          // SNMP printer queries
  "joi": "^17.11.0",               // Configuration validation
  "jest": "^29.7.0"                // Unit testing framework
}
```

**Platform-Specific Considerations:**
- Windows: Elevated privileges for network management
- Linux: sudo access for IP configuration  
- macOS: Security permissions for network operations
- Cross-platform: Different USB driver behaviors

---

This roadmap provides a clear path for completing the printer auto-configuration system and extending it with advanced features. Each task includes sufficient technical detail for developers to understand the requirements and begin implementation.