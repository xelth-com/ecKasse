module.exports = {
  apps: [{
    name: 'eckasse-com',
    script: './packages/backend/src/server.js',
    cwd: '/var/www/eckasse.com',
    watch: false,
    exec_mode: 'fork',
    instances: 1,
    env_production: {
      NODE_ENV: 'production'
    }
  }]
};
