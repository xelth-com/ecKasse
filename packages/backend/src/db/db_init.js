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
 * @returns {Promise<void>}
 */
async function ensureDefaultUsersAndRoles() {
  logger.info('Starting database initialization check...');
  
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
    });
    
    logger.info('✅ Database initialization completed successfully');
    
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