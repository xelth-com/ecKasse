const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const CoreController = require('../utils/printers/core_controller');
const systemTools = require('../utils/printers/system_tools');

const PRINTERS_CONFIG_PATH = path.join(__dirname, '../config/printers.json');

/**
 * Service to manage all printer-related operations.
 */
class PrinterService {
  constructor() {
    this.printers = [];
  }

  /**
   * Loads the printer configurations from the JSON file.
   */
  async loadPrinters() {
    try {
      const data = await fs.readFile(PRINTERS_CONFIG_PATH, 'utf-8');
      this.printers = JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, create it.
        await this.savePrinters();
      } else {
        console.error('Error loading printer configuration:', error);
      }
    }
  }

  /**
   * Saves the current printer configurations to the JSON file.
   */
  async savePrinters() {
    await fs.writeFile(PRINTERS_CONFIG_PATH, JSON.stringify(this.printers, null, 2));
  }

  /**
   * Adds a new printer to the configuration and saves it.
   * @param {object} printerData - Data for the new printer.
   */
  async addPrinter(printerData) {
    const newPrinter = {
      id: uuidv4(),
      name: `New ${printerData.model}`,
      roles: ['receipts'], // Default role
      ...printerData
    };
    this.printers.push(newPrinter);
    await this.savePrinters();
    console.log(`[PrinterService] Added new printer: ${newPrinter.name}`);
    return newPrinter;
  }

  /**
   * Finds a printer by its assigned role.
   * @param {string} role - The role to search for (e.g., 'kitchen_orders').
   * @returns {object | undefined} The printer object or undefined if not found.
   */
  getPrinterByRole(role) {
    return this.printers.find(p => p.roles.includes(role));
  }

  /**
   * Initiates the auto-discovery and configuration process.
   * @param {object} [options] - Optional configuration options
   * @param {string} [options.networkRange] - Optional network range to scan (e.g., '192.168.0.0/24')
   */
  async startAutoConfiguration(options = {}) {
    // Dynamically load all driver modules from the drivers directory
    const driversDir = path.join(__dirname, '../utils/printers/drivers');
    const driverFiles = await fs.readdir(driversDir);
    const printerModules = driverFiles.map(file => require(path.join(driversDir, file)));

    const controller = new CoreController(printerModules, systemTools, this, options);
    await controller.startConfiguration();
  }
}

module.exports = new PrinterService();