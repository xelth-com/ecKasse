module.exports = {
  apps: [{
    name: 'eckasse-desktop-server',
    script: 'npm',
    args: 'run start:server --workspace=@eckasse/desktop',
    cwd: '/var/www/eckasse.com',
    watch: false,
    exec_mode: 'fork',
    instances: 1,
    env_production: {
      NODE_ENV: 'production'
    }
  }]
};
