const bcrypt = require('bcrypt');
const knex = require('../db/knex');

async function resetAdminPin() {
  try {
    console.log('Resetting admin password to 0000...');
    
    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash('0000', saltRounds);
    
    const result = await knex('users')
      .where({ username: 'admin' })
      .update({
        password_hash: newPasswordHash,
        is_active: true,
        updated_at: knex.fn.now()
      });
    
    if (result > 0) {
      console.log('Admin password successfully reset to 0000');
      console.log('Admin user set to active');
    } else {
      console.log('No admin user found - creating new admin user...');
      
      await knex('users').insert({
        username: 'admin',
        full_name: 'System Administrator',
        password_hash: newPasswordHash,
        role_id: 1,
        is_active: true,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now()
      });
      
      console.log('New admin user created with password 0000');
    }
    
    await knex.destroy();
    console.log('Database connection closed');
    
  } catch (error) {
    console.error('Error resetting admin password:', error);
    await knex.destroy();
    process.exit(1);
  }
}

resetAdminPin();