module.exports = {
  apps: [{
    name: 'eckasse-desktop-server',
    script: 'npm',
    args: 'run dev:backend',
    cwd: '/var/www/eckasse.com',
    watch: false,
    env_production: {
      NODE_ENV: 'production'
    }
  }]
};
