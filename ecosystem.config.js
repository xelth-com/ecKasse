module.exports = {
  apps: [{
    name: 'eckasse-web-server',
    script: 'npm',
    args: 'start --workspace=@eckasse/web',
    cwd: '/var/www/eckasse.com',
    watch: false,
    env_production: {
      NODE_ENV: 'production'
    }
  }]
};