module.exports = {
  apps: [{
    name: 'eckasse-desktop-server',
    script: 'packages/desktop/server/start.js',
    cwd: '/var/www/eckasse.com',
    watch: false,
    env_production: {
      NODE_ENV: 'production'
    }
  }]
};