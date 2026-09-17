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

    try {
        console.log('[postbuild] Contents of /etc/nginx/sites-available/crawl-data.conf:');
        try {
            console.log(fs.readFileSync('/etc/nginx/sites-available/crawl-data.conf', 'utf8'));
        } catch (e) {
            console.log('Error reading nginx conf:', e.message);
        }

        console.log('[postbuild] Checking process on port 3000:');
        try {
            console.log(execSync('fuser 3000/tcp || lsof -i :3000 || ss -lptn "sport = :3000" || true').toString());
        } catch (e) {}

        console.log('[postbuild] Freeing port 3000 if occupied by orphan process...');
        try {
            execSync('fuser -k 3000/tcp || true', { stdio: 'inherit' });
        } catch (e) {}

        console.log('[postbuild] Resetting PM2 processes with clean start...');
        execSync('pm2 delete crawl-data-frontend crawl-data-backend || true', { stdio: 'inherit' });
        execSync(`pm2 start ${ecosystemPath} --update-env`, { stdio: 'inherit' });
        execSync('pm2 save', { stdio: 'inherit' });
        console.log('[postbuild] PM2 restarted and saved successfully.');

        console.log('[postbuild] Waiting 3 seconds and checking PM2 error logs...');
        try {
            execSync('sleep 3', { stdio: 'inherit' });
            console.log(execSync('pm2 logs crawl-data-frontend --lines 15 --nostream || true').toString());
        } catch (e) {}

        console.log('[postbuild] PM2 status after clean start:');
        try {
            console.log(execSync('pm2 status || true').toString());
        } catch (e) {}
    } catch (pm2Err) {
        console.warn('[postbuild] Note on PM2 restart:', pm2Err.message);
    }
} catch (err) {
    console.error('[postbuild] Error writing ecosystem config:', err.message);
}
