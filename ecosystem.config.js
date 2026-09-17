module.exports = {
  apps: [
    {
      name: 'crawl-data-backend',
      cwd: '/srv/marketing/crawl-data/server',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 5105
      }
    },
    {
      name: 'crawl-data-frontend',
      cwd: '/srv/marketing/crawl-data/frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 5104',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 5104,
        BACKEND_URL: 'http://127.0.0.1:5105'
      }
    }
  ]
};
