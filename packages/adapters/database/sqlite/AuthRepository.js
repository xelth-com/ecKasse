const { parseJsonIfNeeded } = require('../../../core/utils/db-helper');

class AuthRepository {
  constructor(db) {
    this.db = db;
  }

  async findUserByUsernameWithRole(username, trx = this.db) {
    const user = await trx('users')
      .select(['users.*', 'roles.role_name', 'roles.permissions', 'roles.can_approve_changes', 'roles.can_manage_users'])
      .join('roles', 'users.role_id', 'roles.id')
      .where('users.username', username)
      .where('users.is_active', true)
      .first();
    if (user) {
      user.permissions = parseJsonIfNeeded(user.permissions);
      user.user_preferences = parseJsonIfNeeded(user.user_preferences);
    }
    return user;
  }

  async findActiveUsersWithRolesByPin(trx = this.db) {
    const users = await trx('users')
      .select(['users.*', 'roles.role_name', 'roles.permissions', 'roles.can_approve_changes', 'roles.can_manage_users'])
      .join('roles', 'users.role_id', 'roles.id')
      .where('users.is_active', true);
    return users.map(user => ({...user, permissions: parseJsonIfNeeded(user.permissions)}));
  }

  async updateUser(id, data, trx = this.db) {
    return trx('users').where('id', id).update(data);
  }

  async createSession(sessionData, trx = this.db) {
    return trx('user_sessions').insert(sessionData);
  }

  async findValidSessionById(sessionId, trx = this.db) {
    const session = await trx('user_sessions')
      .select(['user_sessions.*', 'users.username', 'users.is_active as user_is_active', 'roles.role_name', 'roles.permissions'])
      .join('users', 'user_sessions.user_id', 'users.id')
      .join('roles', 'users.role_id', 'roles.id')
      .where('user_sessions.session_id', sessionId)
      .where('user_sessions.is_active', true)
      .where('user_sessions.expires_at', '>', new Date())
      .where('users.is_active', true)
      .first();
    if (session) {
      session.permissions = parseJsonIfNeeded(session.permissions);
    }
    return session;
  }

  async invalidateSession(sessionId, trx = this.db) {
    return trx('user_sessions').where('session_id', sessionId).update({ is_active: false });
  }

  async deleteExpiredSessions(trx = this.db) {
    return trx('user_sessions')
      .where('expires_at', '<', new Date())
      .orWhere('is_active', false)
      .del();
  }

  async findUserWithRoleById(userId, trx = this.db) {
    const user = await trx('users')
      .select(['users.id', 'users.username', 'users.full_name', 'users.email', 'users.storno_daily_limit', 'users.storno_emergency_limit', 'users.storno_used_today', 'users.trust_score', 'roles.role_name', 'roles.permissions', 'roles.can_approve_changes', 'roles.can_manage_users'])
      .join('roles', 'users.role_id', 'roles.id')
      .where('users.id', userId)
      .where('users.is_active', true)
      .first();
    if (user) {
      user.permissions = parseJsonIfNeeded(user.permissions);
    }
    return user;
  }

  async getLoginUsers(trx = this.db) {
    return trx('users')
      .select(['users.id', 'users.username', 'users.full_name'])
      .where('users.is_active', true)
      .orderBy('users.full_name', 'asc');
  }
}

module.exports = { AuthRepository };