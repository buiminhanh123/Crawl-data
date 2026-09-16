const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Only run on production Linux VPS where /srv/marketing/crawl-data exists
const TARGET_DIR = '/srv/marketing/crawl-data';

if (process.platform !== 'linux' || !fs.existsSync(TARGET_DIR)) {
    console.log('[postbuild] Local or non-server environment detected. Skipping server PM2 configuration.');
    process.exit(0);
}

console.log('[postbuild] Linux server detected. Updating ecosystem.config.js and PM2 processes...');

const ecosystemContent = `module.exports = {
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
`;

try {
    const ecosystemPath = path.join(TARGET_DIR, 'ecosystem.config.js');
    fs.writeFileSync(ecosystemPath, ecosystemContent, 'utf8');
    console.log('[postbuild] Written fresh ecosystem.config.js to', ecosystemPath);
} catch (err) {
    console.error('[postbuild] Error writing ecosystem config:', err.message);
}
