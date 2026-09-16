module.exports = {
  apps: [
    {
      name: 'crawl-data-backend',
      cwd: '/srv/marketing/crawl-data/server',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      }
    },
    {
      name: 'crawl-data-frontend',
      cwd: '/srv/marketing/crawl-data/frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
