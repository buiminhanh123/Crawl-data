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
      script: '/srv/marketing/crawl-data/server/server.js',
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
      script: '/srv/marketing/crawl-data/frontend/node_modules/next/dist/bin/next',
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
`;

try {
    const ecosystemPath = path.join(TARGET_DIR, 'ecosystem.config.js');
    fs.writeFileSync(ecosystemPath, ecosystemContent, 'utf8');
    console.log('[postbuild] Written fresh ecosystem.config.js to', ecosystemPath);

    try {
        console.log('[postbuild] Inspecting processes holding port 5104 or 5105:');
        try {
            console.log(execSync('ps -ef | grep -E "node|5104|5105" || true').toString());
        } catch (e) {}

        console.log('[postbuild] Forcibly killing any process on port 5104 or 5105...');
        try {
            execSync('kill -9 $(lsof -t -i:5104 -i:5105) 2>/dev/null || true');
            execSync('fuser -k -9 5104/tcp 5105/tcp 2>/dev/null || true');
        } catch (e) {}

        console.log('[postbuild] Verifying ports 5104 and 5105 are free:');
        try {
            console.log(execSync('ss -lptn "sport = :5104 or sport = :5105" || true').toString());
        } catch (e) {}

        console.log('[postbuild] Resetting PM2 processes with clean start on ports 5104/5105 (fork mode)...');
        execSync('pm2 delete crawl-data-frontend crawl-data-backend || true', { stdio: 'inherit' });
        execSync(`pm2 start ${ecosystemPath} --update-env`, { stdio: 'inherit' });
        execSync('pm2 save', { stdio: 'inherit' });
        console.log('[postbuild] PM2 restarted and saved successfully.');

        console.log('[postbuild] Waiting 4 seconds and checking PM2 logs...');
        try {
            execSync('sleep 4', { stdio: 'inherit' });
            console.log('--- PM2 describe crawl-data-frontend ---');
            console.log(execSync('pm2 describe crawl-data-frontend || true').toString());
            console.log('--- Last error log lines ---');
            console.log(execSync('cat /home/daco-local/.pm2/logs/crawl-data-frontend-error*.log | tail -n 30 || true').toString());
            console.log('--- Last out log lines ---');
            console.log(execSync('cat /home/daco-local/.pm2/logs/crawl-data-frontend-out*.log | tail -n 30 || true').toString());
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
