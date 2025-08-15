/**
 * Database Initialization Script
 * 
 * This module provides robust database initialization logic that runs on server startup
 * to ensure the system always has the necessary default data to function properly.
 * 
 * Key Features:
 * - Ensures at least one admin user exists in the system
 * - Creates default roles if none exist
 * - Prevents user lockout scenarios on fresh installations
 * - Handles both fresh installations and existing databases gracefully
 * 
 * @author ecKasse Development Team
 */

const bcrypt = require('bcrypt');
const db = require('./knex');
const logger = require('../config/logger');

/**
 * Ensures that default users and roles exist in the database.
 * This function is called during server startup to prevent user lockout scenarios.
 * 
 * @returns {Promise<{isFirstRun: boolean, defaultUser?: {username: string, password: string}}>}
 */
async function ensureDefaultUsersAndRoles() {
  logger.info('Starting database initialization check...');
  
  let initResult = { isFirstRun: false };
  
  try {
    await db.transaction(async (trx) => {
      // Step 1: Check if any roles exist
      const existingRoles = await trx('roles').count('id as count');
      const roleCount = existingRoles[0].count;
      
      let adminRoleId = null;
      
      if (roleCount === 0) {
        logger.info('No roles found in database, creating default admin role...');
        
        // Create default admin role
        const adminRoleResult = await trx('roles').insert({
          role_name: 'admin',
          role_display_names: JSON.stringify({ 
            en: 'Administrator', 
            de: 'Administrator',
            ru: 'Администратор'
          }),
          description: 'System Administrator with full access',
          permissions: JSON.stringify(['all']),
          default_storno_daily_limit: 999,
          default_storno_emergency_limit: 999,
          can_approve_changes: true,
          can_manage_users: true,
          is_system_role: true,
          audit_trail: JSON.stringify({
            created_at: new Date().toISOString(),
            created_by: 'system_initialization'
          })
        }).returning('id');
        
        adminRoleId = adminRoleResult[0].id || adminRoleResult[0];
        logger.info('Default admin role created successfully', { roleId: adminRoleId });
        
        // Also create a basic user role for future use
        await trx('roles').insert({
          role_name: 'user',
          role_display_names: JSON.stringify({ 
            en: 'User', 
            de: 'Benutzer',
            ru: 'Пользователь'
          }),
          description: 'Basic user with limited permissions',
          permissions: JSON.stringify(['pos_operations', 'view_reports']),
          default_storno_daily_limit: 5,
          default_storno_emergency_limit: 1,
          can_approve_changes: false,
          can_manage_users: false,
          is_system_role: true,
          audit_trail: JSON.stringify({
            created_at: new Date().toISOString(),
            created_by: 'system_initialization'
          })
        });
        
        logger.info('Default user role created successfully');
      } else {
        // Find existing admin role
        const existingAdminRole = await trx('roles')
          .where('role_name', 'admin')
          .orWhere('can_manage_users', true)
          .first();
        
        if (existingAdminRole) {
          adminRoleId = existingAdminRole.id;
          logger.info('Found existing admin role', { roleId: adminRoleId });
        } else {
          // Create admin role if it doesn't exist but other roles do
          logger.warn('No admin role found among existing roles, creating one...');
          
          const adminRoleResult = await trx('roles').insert({
            role_name: 'admin',
            role_display_names: JSON.stringify({ 
              en: 'Administrator', 
              de: 'Administrator',
              ru: 'Администратор'
            }),
            description: 'System Administrator with full access',
            permissions: JSON.stringify(['all']),
            default_storno_daily_limit: 999,
            default_storno_emergency_limit: 999,
            can_approve_changes: true,
            can_manage_users: true,
            is_system_role: true,
            audit_trail: JSON.stringify({
              created_at: new Date().toISOString(),
              created_by: 'system_initialization'
            })
          }).returning('id');
          
          adminRoleId = adminRoleResult[0].id || adminRoleResult[0];
          logger.info('Admin role created successfully', { roleId: adminRoleId });
        }
      }
      
      // Step 2: Check if any users exist
      const existingUsers = await trx('users').count('id as count');
      const userCount = existingUsers[0].count;
      
      if (userCount === 0) {
        logger.info('No users found in database, creating default admin user...');
        
        // Create default admin user
        const defaultPassword = '1234';
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(defaultPassword, saltRounds);
        
        await trx('users').insert({
          username: 'admin',
          email: 'admin@localhost',
          password_hash: hashedPassword,
          full_name: 'System Administrator',
          role_id: adminRoleId,
          storno_daily_limit: 999,
          storno_emergency_limit: 999,
          trust_score: 100,
          is_active: true,
          force_password_change: process.env.NODE_ENV === 'production', // SECURITY: Force password change in production only
          user_preferences: JSON.stringify({}),
          audit_trail: JSON.stringify({
            created_at: new Date().toISOString(),
            created_by: 'system_initialization',
            note: 'Default admin user created on system initialization'
          })
        });
        
        // Mark this as first run with default user created
        initResult = {
          isFirstRun: true,
          defaultUser: {
            username: 'admin',
            password: '1234'
          }
        };
        
        logger.warn('⚠️  DEFAULT ADMIN USER CREATED', {
          username: 'admin',
          password: '1234',
          security_note: 'Password change is REQUIRED on first login'
        });
        
        logger.info('Default admin user created successfully - SECURITY: Password change required on first login');
      } else {
        // Check if there's at least one admin user
        const adminUsers = await trx('users')
          .join('roles', 'users.role_id', 'roles.id')
          .where('roles.can_manage_users', true)
          .orWhere('roles.role_name', 'admin')
          .count('users.id as count');
        
        const adminUserCount = adminUsers[0].count;
        
        if (adminUserCount === 0) {
          logger.warn('No admin users found in existing user base, creating emergency admin...');
          
          const defaultPassword = '1234';
          const saltRounds = 12;
          const hashedPassword = await bcrypt.hash(defaultPassword, saltRounds);
          
          await trx('users').insert({
            username: 'emergency_admin',
            email: 'emergency@localhost',
            password_hash: hashedPassword,
            full_name: 'Emergency Administrator',
            role_id: adminRoleId,
            storno_daily_limit: 999,
            storno_emergency_limit: 999,
            trust_score: 100,
            is_active: true,
            force_password_change: process.env.NODE_ENV === 'production', // SECURITY: Force password change in production only
            user_preferences: JSON.stringify({}),
            audit_trail: JSON.stringify({
              created_at: new Date().toISOString(),
              created_by: 'system_initialization',
              note: 'Emergency admin user created - no admin users were found in existing database'
            })
          });
          
          logger.warn('⚠️  EMERGENCY ADMIN USER CREATED', {
            username: 'emergency_admin',
            password: '1234',
            reason: 'No admin users found in existing database',
            security_note: 'Password change is REQUIRED on first login'
          });
        } else {
          logger.info('Database initialization check complete - admin users found', {
            totalUsers: userCount,
            adminUsers: adminUserCount
          });
        }
      }
      
      // Step 3: Ensure minimal structure exists (company, branch, POS device, categories)
      const existingCompanies = await trx('companies').count('id as count');
      const companyCount = existingCompanies[0].count;
      
      if (companyCount === 0) {
        logger.info('No companies found in database, creating default company structure...');
        
        // Create default company
        const companyResult = await trx('companies').insert({
          company_full_name: 'Default Restaurant',
          meta_information: JSON.stringify({
            tax_number: '000000000',
            address: {
              street: 'Default Street 1',
              city: 'Default City',
              postal_code: '00000',
              country: 'DE'
            },
            contact_info: {
              phone: '+49 000 000000',
              email: 'contact@restaurant.local'
            }
          }),
          global_configurations: JSON.stringify({
            currency: 'EUR',
            timezone: 'Europe/Berlin',
            language: 'de',
            fiscal_compliance: 'DE'
          })
        }).returning('id');
        
        const companyId = companyResult[0].id || companyResult[0];
        logger.info('Default company created successfully', { companyId });
        
        // Create default branch
        const branchResult = await trx('branches').insert({
          company_id: companyId,
          branch_name: 'Main Branch',
          branch_address: 'Default Street 1, 00000 Default City'
        }).returning('id');
        
        const branchId = branchResult[0].id || branchResult[0];
        logger.info('Default branch created successfully', { branchId });
        
        // Create default POS device
        const posDeviceResult = await trx('pos_devices').insert({
          branch_id: branchId,
          pos_device_name: 'Main Terminal',
          pos_device_type: 'terminal',
          pos_device_external_number: 1,
          pos_device_settings: JSON.stringify({
            receipt_printer: true,
            cash_drawer: true,
            display: 'builtin'
          })
        }).returning('id');
        
        const posDeviceId = posDeviceResult[0].id || posDeviceResult[0];
        logger.info('Default POS device created successfully', { posDeviceId });
        
        // Create default categories
        const categories = [
          {
            pos_device_id: posDeviceId,
            source_unique_identifier: 'default-food',
            category_names: JSON.stringify({
              de: 'Speisen',
              en: 'Food',
              ru: 'Еда'
            }),
            category_type: 'food',
            default_linked_main_group_unique_identifier: 1,
            audit_trail: JSON.stringify({
              created_at: new Date().toISOString(),
              created_by: 'system_initialization'
            })
          },
          {
            pos_device_id: posDeviceId,
            source_unique_identifier: 'default-drinks',
            category_names: JSON.stringify({
              de: 'Getränke',
              en: 'Drinks',
              ru: 'Напитки'
            }),
            category_type: 'drink',
            default_linked_main_group_unique_identifier: 2,
            audit_trail: JSON.stringify({
              created_at: new Date().toISOString(),
              created_by: 'system_initialization'
            })
          }
        ];
        
        for (const category of categories) {
          await trx('categories').insert(category);
        }
        
        logger.info('Default categories created successfully', { 
          categories: categories.map(c => c.source_unique_identifier)
        });
        
        logger.warn('⚠️  DEFAULT STRUCTURE CREATED', {
          company: 'Default Restaurant',
          branch: 'Main Branch',
          posDevice: 'Main Terminal (POS-001)',
          categories: ['Speisen', 'Getränke'],
          note: 'Ready for menu import or manual product creation'
        });
        
      } else {
        logger.info('Company structure already exists, skipping default structure creation');
      }
    });
    
    logger.info('✅ Database initialization completed successfully');
    return initResult;
    
  } catch (error) {
    logger.error('❌ Database initialization failed', {
      error: error.message,
      stack: error.stack
    });
    
    // This is critical - if we can't ensure basic user access, the system won't be usable
    throw new Error(`Critical database initialization failure: ${error.message}`);
  }
}

/**
 * Validates that the database has the required structure for user management
 * 
 * @returns {Promise<boolean>}
 */
async function validateDatabaseStructure() {
  try {
    // Check if required tables exist
    const requiredTables = ['users', 'roles'];
    
    for (const tableName of requiredTables) {
      const exists = await db.schema.hasTable(tableName);
      if (!exists) {
        logger.error(`Required table '${tableName}' does not exist`);
        return false;
      }
    }
    
    // Check if required columns exist in users table
    const requiredUserColumns = ['username', 'password_hash', 'role_id', 'force_password_change'];
    
    for (const columnName of requiredUserColumns) {
      const exists = await db.schema.hasColumn('users', columnName);
      if (!exists) {
        logger.error(`Required column 'users.${columnName}' does not exist`);
        return false;
      }
    }
    
    logger.info('Database structure validation passed');
    return true;
    
  } catch (error) {
    logger.error('Database structure validation failed', { error: error.message });
    return false;
  }
}

module.exports = {
  ensureDefaultUsersAndRoles,
  validateDatabaseStructure
};