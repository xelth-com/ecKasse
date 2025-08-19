const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

// Desktop server entry point - Dependency Injection Container
const http = require('http');
const WebSocket = require('ws');
const { DesktopServer } = require('./app');

// Import core business logic and database adapters
const { services, db, dbInit, ProductService, TransactionManagementService, AuthService, ReportingService } = require('../../core');
const { SQLiteAdapter } = require('../../adapters/database/sqlite');
const logger = require('../../core/config/logger');

const PORT = process.env.BACKEND_PORT || 3030;
const nodeVersionRequired = '20.0.0';
const currentVersion = process.version;
console.log(`[DEBUG] Node.js version active for this script: ${currentVersion}`);

// Check Node.js version compatibility
const semver = require('semver');
if (semver.major(currentVersion) < 20) {
  console.warn(`[WARNING] Node.js version ${currentVersion} may not be fully compatible. Recommended: v20+ or v24+`);
} else {
  console.log(`[INFO] Node.js version ${currentVersion} is compatible.`);
}

// Helper function to get company and branch info
async function getCompanyAndBranchInfo() {
  try {
    const companyData = await db('companies').first() || {};
    const branchData = await db('branches').first() || {};
    
    return {
      companyName: companyData.name || 'ecKasse Demo',
      branchName: branchData.name || 'Hauptfiliale',
      branchAddress: branchData.address || 'Musterstraße 1, 12345 Berlin'
    };
    
  } catch (error) {
    logger.warn({ 
      msg: 'Could not fetch company/branch info from database, using defaults', 
      error: error.message 
    });
    
    return {
      companyName: 'ecKasse Demo',
      branchName: 'Hauptfiliale',
      branchAddress: 'Musterstraße 1, 12345 Berlin'
    };
  }
}

async function runRecoveryProcess() {
  logger.info('Starting recovery process for stale active transactions...');
  
  try {
    const staleTransactions = await db('active_transactions')
      .where('status', 'active')
      .where('resolution_status', 'none')
      .select('id', 'uuid', 'created_at');

    if (staleTransactions.length > 0) {
      await db('active_transactions')
        .where('status', 'active')
        .where('resolution_status', 'none')
        .update('resolution_status', 'pending');

      logger.warn({ 
        count: staleTransactions.length,
        transactions: staleTransactions.map(t => ({ id: t.id, uuid: t.uuid, created_at: t.created_at }))
      }, `Marked ${staleTransactions.length} stale transactions as pending for recovery.`);
    } else {
      logger.info('No stale active transactions found. System is clean.');
    }
  } catch (error) {
    logger.error({ 
      msg: 'Failed to run recovery process for stale active transactions.', 
      error: error.message, 
      stack: error.stack 
    });
  }
}

// Global variable to store initialization result
let initializationResult = { isFirstRun: false };

async function startServer() {
  // Ensure default users and roles exist and capture result
  initializationResult = await dbInit.ensureDefaultUsersAndRoles();
  
  // Run recovery process for stale active transactions
  await runRecoveryProcess();

  // Initialize printer service
  try {
    await services.printer.loadPrinters();
    logger.info('Printer service initialized successfully');
  } catch (error) {
    logger.warn('Failed to initialize printer service:', error.message);
  }

  // ============ DEPENDENCY INJECTION CONTAINER ============
  
  // 1. Initialize database connection (already done via core/db/knex)
  logger.info('Database connection established via core package');
  
  // 2. Instantiate SQLite adapter with database connection
  const sqliteAdapter = new SQLiteAdapter(db);
  logger.info('SQLite adapter instantiated');
  
  // 3. Instantiate ProductService with repository from adapter
  const productRepository = sqliteAdapter.getProductRepository();
  const productService = new ProductService(productRepository, db);
  logger.info('ProductService instantiated with ProductRepository');
  
  // 4. Instantiate TransactionManagementService with repositories and services
  const transactionRepository = sqliteAdapter.getTransactionRepository();
  const transactionManagementService = new TransactionManagementService(
    transactionRepository,
    productRepository,
    services.logging,
    services.printer
  );
  logger.info('TransactionManagementService instantiated with TransactionRepository');
  
  // 5. Instantiate AuthService and ReportingService with their repositories
  const authRepository = sqliteAdapter.getAuthRepository();
  const authService = new AuthService(authRepository);
  // Start session cleanup interval for AuthService
  setInterval(() => {
    authService.cleanupExpiredSessions();
  }, 60 * 60 * 1000); // Every hour
  logger.info('AuthService instantiated with AuthRepository');
  
  const reportingRepository = sqliteAdapter.getReportingRepository();
  const reportingService = new ReportingService(reportingRepository);
  logger.info('ReportingService instantiated with ReportingRepository');
  
  // 6. Create services object with instantiated services
  const instantiatedServices = {
    ...services,
    product: productService,  // Replace the old product service with the new class instance
    transactionManagement: transactionManagementService,  // Replace the old transaction service with the new class instance
    auth: authService,  // Use the new AuthService instance
    reporting: reportingService  // Use the new ReportingService instance
  };
  
  // 7. Pass the instantiated services to DesktopServer
  const desktopServer = new DesktopServer(instantiatedServices, authService, reportingService);
  const app = await desktopServer.initialize();
  logger.info('DesktopServer initialized with dependency-injected services');
  
  // ============ END DEPENDENCY INJECTION ============
  
  // Create HTTP server
  const httpServer = http.createServer(app);
  
  // Create WebSocket server
  const wss = new WebSocket.Server({ server: httpServer });
  
  // Initialize WebSocket service for broadcasting
  const websocketService = require('../../core/application/websocket.service');
  websocketService.init(wss);

  // WebSocket connection handler
  wss.on('connection', async (ws, req) => {
    ws.id = Date.now() + '_' + Math.random().toString(36).substring(2,7);
    logger.info({ msg: 'WebSocket client connected', clientId: ws.id, remoteAddress: req.socket.remoteAddress });

    // Auto-login for eckasse.com domain
    if (req.headers.host === 'eckasse.com' || req.headers.host === 'www.eckasse.com') {
      try {
        logger.info({ msg: 'eckasse.com domain: Auto-authenticating client', clientId: ws.id });
        
        const authResult = await authService.authenticateUser(
          'admin', 
          '1234', 
          req.socket.remoteAddress || 'eckasse.com-client', 
          'eckasse.com Auto-Login'
        );
        
        if (authResult.success) {
          const sessionMessage = {
            command: 'sessionEstablished',
            payload: {
              user: authResult.user,
              session: authResult.session
            },
            timestamp: new Date().toISOString(),
            clientId: ws.id
          };
          
          ws.send(JSON.stringify(sessionMessage));
          logger.info({ 
            msg: 'eckasse.com domain: Auto-authentication successful', 
            clientId: ws.id,
            username: authResult.user.username
          });
        } else {
          logger.error({ 
            msg: 'eckasse.com domain: Auto-authentication failed', 
            clientId: ws.id,
            error: authResult.error 
          });
        }
      } catch (error) {
        logger.error({ 
          msg: 'eckasse.com domain: Auto-authentication error', 
          clientId: ws.id,
          error: error.message 
        });
      }
    }

    ws.on('message', (message) => {
      desktopServer.handleWebSocketMessage(ws, message, db);
    });

    ws.on('close', () => {
      logger.info({ msg: 'WebSocket client disconnected', clientId: ws.id });
    });

    ws.on('error', (error) => {
      logger.error({ msg: 'WebSocket client error', clientId: ws.id, err: error });
    });

    ws.send(JSON.stringify({ 
      message: 'Welcome to ecKasse WebSocket API!', 
      clientId: ws.id,
      serverTime: new Date().toISOString()
    }));

    // Check if this was the first run and send admin credentials if needed
    if (initializationResult.isFirstRun && initializationResult.defaultUser) {
      const firstRunMessage = {
        command: 'firstRunAdminCreated',
        payload: {
          username: initializationResult.defaultUser.username,
          password: initializationResult.defaultUser.password,
          message: `Willkommen! Admin-Benutzer '${initializationResult.defaultUser.username}' wurde erstellt mit PIN: ${initializationResult.defaultUser.password}`
        },
        timestamp: new Date().toISOString(),
        clientId: ws.id
      };
      
      ws.send(JSON.stringify(firstRunMessage));
      logger.info({ 
        msg: 'Sent first run admin credentials to client', 
        clientId: ws.id,
        username: initializationResult.defaultUser.username 
      });
    }

    // Send pending recovery transactions to newly connected client
    (async () => {
      try {
        const pendingTransactions = await instantiatedServices.transactionManagement.getPendingTransactions();
        
        if (pendingTransactions.length > 0) {
          const pendingMessage = {
            command: 'pendingTransactions',
            payload: {
              transactions: pendingTransactions,
              count: pendingTransactions.length
            },
            timestamp: new Date().toISOString(),
            clientId: ws.id
          };
          
          ws.send(JSON.stringify(pendingMessage));
          logger.info({ 
            msg: 'Sent pending recovery transactions to client', 
            clientId: ws.id, 
            count: pendingTransactions.length 
          });
        } else {
          logger.info({ 
            msg: 'No pending recovery transactions to send to client', 
            clientId: ws.id 
          });
          
          // Send company/branch info since no pending transactions exist
          try {
            const companyInfo = await getCompanyAndBranchInfo();
            const initialAppDataMessage = {
              command: 'initialAppData',
              payload: {
                companyInfo
              },
              serverTime: new Date().toISOString(),
              clientId: ws.id
            };
            
            ws.send(JSON.stringify(initialAppDataMessage));
            logger.info({ 
              msg: 'Sent initial app data (company info) to client', 
              clientId: ws.id,
              companyInfo
            });
          } catch (error) {
            logger.error({ 
              msg: 'Failed to send initial app data to client', 
              clientId: ws.id, 
              error: error.message 
            });
          }
        }
      } catch (error) {
        logger.error({ 
          msg: 'Failed to send pending recovery transactions to client', 
          clientId: ws.id, 
          error: error.message 
        });
      }
    })();
  });

  // Start the server
  httpServer.listen(PORT, () => {
    logger.info(`Desktop server (HTTP & WebSocket) listening on http://localhost:${PORT}`);
    logger.info(`Repository pattern implementation complete - All core services (ProductService, TransactionManagementService, AuthService, ReportingService) using repository pattern`);
  });
}

// Initialize and start the server
startServer().catch(error => {
  logger.error('Failed to start server:', error.message);
  logger.error('Error stack:', error.stack);
  console.error('STARTUP ERROR:', error.message);
  console.error('ERROR STACK:', error.stack);
  process.exit(1);
});