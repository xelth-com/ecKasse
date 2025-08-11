// File: /packages/backend/src/db/migrations/20250722000500_create_user_management_tables.js
exports.up = function (knex) {
  return knex.schema
    .createTable('roles', (table) => {
      table.increments('id').primary();
      table.string('role_name').notNullable().unique();
      table.jsonb('role_display_names').notNullable(); // multilingual names
      table.text('description');
      table.jsonb('permissions').notNullable(); // array of permission strings
      table.decimal('default_storno_daily_limit', 10, 2).defaultTo(50.00);
      table.decimal('default_storno_emergency_limit', 10, 2).defaultTo(25.00);
      table.boolean('can_approve_changes').defaultTo(false);
      table.boolean('can_manage_users').defaultTo(false);
      table.boolean('is_system_role').defaultTo(false);
      table.jsonb('audit_trail').notNullable();
      table.timestamps(true, true);
    })
    .createTable('users', (table) => {
      table.increments('id').primary();
      table.string('username').notNullable().unique();
      table.string('email').notNullable().unique();
      table.string('password_hash').notNullable();
      table.string('full_name').notNullable();
      table.integer('role_id').unsigned().references('id').inTable('roles').onDelete('RESTRICT');
      table.integer('pos_device_id').unsigned().references('id').inTable('pos_devices').onDelete('SET NULL');
      table.decimal('storno_daily_limit', 10, 2).notNullable();
      table.decimal('storno_emergency_limit', 10, 2).notNullable();
      table.decimal('storno_used_today', 10, 2).defaultTo(0.00);
      table.integer('trust_score').defaultTo(50).checkBetween([0, 100]);
      table.boolean('is_active').defaultTo(true);
      table.boolean('force_password_change').defaultTo(false);
      table.timestamp('last_login_at');
      table.string('last_login_ip');
      table.integer('failed_login_attempts').defaultTo(0);
      table.timestamp('locked_until');
      table.jsonb('user_preferences'); // UI preferences, language, etc.
      table.jsonb('audit_trail').notNullable();
      table.timestamps(true, true);
      
      // Indexes for performance
      table.index(['username']);
      table.index(['email']);
      table.index(['role_id']);
      table.index(['is_active']);
    })
    .createTable('pending_changes', (table) => {
      table.increments('id').primary();
      table.string('change_id').notNullable().unique();
      table.integer('requested_by_user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.string('change_type').notNullable(); // 'product_update', 'price_change', 'category_create', etc.
      table.string('target_entity_type').notNullable(); // 'product', 'category', 'user', etc.
      table.integer('target_entity_id').unsigned(); // ID of the entity being changed
      table.jsonb('original_data'); // current state before change
      table.jsonb('proposed_data').notNullable(); // proposed new state
      table.text('reason'); // reason for change
      table.string('priority').defaultTo('normal'); // 'low', 'normal', 'high', 'urgent'
      table.string('status').defaultTo('pending'); // 'pending', 'approved', 'rejected', 'auto_applied'
      table.integer('reviewed_by_user_id').unsigned().references('id').inTable('users').onDelete('SET NULL');
      table.timestamp('reviewed_at');
      table.text('review_notes');
      table.timestamp('auto_apply_at'); // for scheduled automatic application
      table.boolean('requires_admin_approval').defaultTo(true);
      table.jsonb('audit_trail').notNullable();
      table.timestamps(true, true);
      
      // Indexes for performance
      table.index(['status']);
      table.index(['requested_by_user_id']);
      table.index(['change_type']);
      table.index(['priority']);
      table.index(['auto_apply_at']);
    })
    .createTable('storno_log', (table) => {
      table.increments('id').primary();
      table.string('storno_id').notNullable().unique();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.string('transaction_id').notNullable(); // reference to original transaction
      table.decimal('storno_amount', 10, 2).notNullable();
      table.string('storno_type').notNullable(); // 'automatic', 'admin_approved', 'emergency'
      table.text('reason').notNullable();
      table.integer('approved_by_user_id').unsigned().references('id').inTable('users').onDelete('SET NULL');
      table.boolean('within_credit_limit').defaultTo(true);
      table.decimal('credit_used', 10, 2).notNullable();
      table.decimal('remaining_credit_after', 10, 2).notNullable();
      table.string('approval_status').defaultTo('automatic'); // 'automatic', 'pending', 'approved', 'rejected'
      table.timestamp('approved_at');
      table.jsonb('additional_data'); // any extra context data
      table.jsonb('audit_trail').notNullable();
      table.timestamps(true, true);
      
      // Indexes for performance
      table.index(['user_id']);
      table.index(['transaction_id']);
      table.index(['storno_type']);
      table.index(['approval_status']);
      table.index(['created_at']);
    })
    .createTable('user_sessions', (table) => {
      table.increments('id').primary();
      table.string('session_id').notNullable().unique();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.timestamp('expires_at').notNullable();
      table.string('ip_address');
      table.string('user_agent');
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);
      
      // Indexes for performance
      table.index(['session_id']);
      table.index(['user_id']);
      table.index(['expires_at']);
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('user_sessions')
    .dropTableIfExists('storno_log')
    .dropTableIfExists('pending_changes')
    .dropTableIfExists('users')
    .dropTableIfExists('roles');
};