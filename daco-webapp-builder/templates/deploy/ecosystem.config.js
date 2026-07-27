module.exports = {
  apps: [
    {
      name: '{APP_NAME}',
      script: 'node_modules/next/dist/bin/next', // Path to Next.js runner
      args: 'start',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: {PORT}
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};
