/**
 * PM2 process manager config for production on VPS.
 * Usage: pm2 start ecosystem.config.cjs --env production
 */
module.exports = {
  apps: [
    {
      name: 'kikooai-backend',
      script: 'src/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
      },
      error_file: '/var/log/kikooai/pm2-error.log',
      out_file: '/var/log/kikooai/pm2-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
