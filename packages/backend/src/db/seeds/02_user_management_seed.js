// File: /packages/backend/src/db/seeds/02_user_management_seed.js
const bcrypt = require('bcrypt');

exports.seed = async function (knex) {
  // Helper function to create audit trail
  const createAuditTrail = (createdBy = 'system_seed') => ({
    created_at: new Date().toISOString(),
    created_by: createdBy,
    last_modified_at: new Date().toISOString(),
    last_modified_by: createdBy,
    version: 1,
    change_log: [{
      timestamp: new Date().toISOString(),
      user: createdBy,
      action: 'created',
      description: 'Initial seed data creation'
    }]
  });

  // Delete existing entries in correct order (respecting foreign keys)
  await knex('user_sessions').del();
  await knex('storno_log').del();
  await knex('pending_changes').del();
  await knex('users').del();
  await knex('roles').del();

  // Insert default roles
  const [managerRoleId] = await knex('roles').insert([
    {
      role_name: 'manager',
      role_display_names: JSON.stringify({
        de: 'Manager',
        en: 'Manager'
      }),
      description: 'Full system access with all management privileges',
      permissions: JSON.stringify([
        'pos.manage_all',
        'users.manage',
        'roles.manage',
        'products.create',
        'products.edit',
        'products.delete',
        'categories.create',
        'categories.edit',
        'categories.delete',
        'reports.view_all',
        'reports.export',
        'storno.approve_unlimited',
        'changes.approve',
        'settings.modify',
        'system.admin'
      ]),
      default_storno_daily_limit: 1000.00,
      default_storno_emergency_limit: 500.00,
      can_approve_changes: true,
      can_manage_users: true,
      is_system_role: true,
      audit_trail: JSON.stringify(createAuditTrail())
    }
  ]).returning('id');

  const [cashierRoleId] = await knex('roles').insert([
    {
      role_name: 'cashier',
      role_display_names: JSON.stringify({
        de: 'Kassierer',
        en: 'Cashier'
      }),
      description: 'Standard POS operator with limited privileges',
      permissions: JSON.stringify([
        'pos.operate',
        'products.view',
        'categories.view',
        'reports.view_own',
        'storno.request',
        'changes.request'
      ]),
      default_storno_daily_limit: 50.00,
      default_storno_emergency_limit: 25.00,
      can_approve_changes: false,
      can_manage_users: false,
      is_system_role: true,
      audit_trail: JSON.stringify(createAuditTrail())
    }
  ]).returning('id');

  const [supervisorRoleId] = await knex('roles').insert([
    {
      role_name: 'supervisor',
      role_display_names: JSON.stringify({
        de: 'Supervisor',
        en: 'Supervisor'
      }),
      description: 'Mid-level access with limited management privileges',
      permissions: JSON.stringify([
        'pos.operate',
        'pos.manage_shift',
        'products.view',
        'products.edit',
        'categories.view',
        'categories.edit',
        'reports.view_department',
        'storno.approve_limited',
        'changes.approve_limited',
        'users.view'
      ]),
      default_storno_daily_limit: 200.00,
      default_storno_emergency_limit: 100.00,
      can_approve_changes: true,
      can_manage_users: false,
      is_system_role: true,
      audit_trail: JSON.stringify(createAuditTrail())
    }
  ]).returning('id');

  // Generate password hashes
  const defaultPassword = '1234'; // Numeric PIN for touch-friendly login
  const saltRounds = 12;
  const hashedPassword = await bcrypt.hash(defaultPassword, saltRounds);

  // Insert default users
  await knex('users').insert([
    {
      username: 'admin',
      email: 'admin@eckasse.local',
      password_hash: hashedPassword,
      full_name: 'System Administrator',
      role_id: managerRoleId.id,
      pos_device_id: null, // Can use any POS device
      storno_daily_limit: 1000.00,
      storno_emergency_limit: 500.00,
      storno_used_today: 0.00,
      trust_score: 100,
      is_active: true,
      force_password_change: true, // Force password change on first login
      user_preferences: JSON.stringify({
        language: 'de',
        theme: 'light',
        notifications: {
          pending_changes: true,
          storno_requests: true,
          system_alerts: true
        }
      }),
      audit_trail: JSON.stringify(createAuditTrail())
    },
    {
      username: 'cashier1',
      email: 'cashier1@eckasse.local',
      password_hash: hashedPassword,
      full_name: 'Maria Schmidt',
      role_id: cashierRoleId.id,
      pos_device_id: null, // Will be assigned to specific POS device later
      storno_daily_limit: 50.00,
      storno_emergency_limit: 25.00,
      storno_used_today: 0.00,
      trust_score: 50,
      is_active: true,
      force_password_change: true,
      user_preferences: JSON.stringify({
        language: 'de',
        theme: 'light',
        notifications: {
          pending_changes: false,
          storno_requests: false,
          system_alerts: true
        }
      }),
      audit_trail: JSON.stringify(createAuditTrail())
    },
    {
      username: 'supervisor1',
      email: 'supervisor1@eckasse.local',
      password_hash: hashedPassword,
      full_name: 'Hans Müller',
      role_id: supervisorRoleId.id,
      pos_device_id: null,
      storno_daily_limit: 200.00,
      storno_emergency_limit: 100.00,
      storno_used_today: 0.00,
      trust_score: 75,
      is_active: true,
      force_password_change: true,
      user_preferences: JSON.stringify({
        language: 'de',
        theme: 'light',
        notifications: {
          pending_changes: true,
          storno_requests: true,
          system_alerts: true
        }
      }),
      audit_trail: JSON.stringify(createAuditTrail())
    }
  ]);

  console.log('✅ User management seed data created successfully');
  console.log('📝 Default credentials:');
  console.log('   Username: admin    | PIN: 1234 | Role: Manager');
  console.log('   Username: cashier1 | PIN: 1234 | Role: Cashier');
  console.log('   Username: supervisor1 | PIN: 1234 | Role: Supervisor');
  console.log('⚠️  Remember to change PINs on first login!');
};