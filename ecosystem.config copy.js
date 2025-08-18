module.exports = {
  apps: [{
    name: 'eckasse-backend',
    script: 'npm',
    args: 'run start:backend',
    cwd: '/var/www/eckasse.com',
    watch: false,
    env_production: { // Add this block
      NODE_ENV: 'production'
    }
  }]
};
