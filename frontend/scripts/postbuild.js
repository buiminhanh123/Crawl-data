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

let ecosystemPath = path.join(TARGET_DIR, 'ecosystem.config.js');
try {
    fs.writeFileSync(ecosystemPath, ecosystemContent, 'utf8');
    console.log('[postbuild] Written fresh ecosystem.config.js to', ecosystemPath);
} catch (e) {
    console.warn('[postbuild] Cannot write to', ecosystemPath, e.message);
    ecosystemPath = path.join(__dirname, '..', 'ecosystem.config.js');
    fs.writeFileSync(ecosystemPath, ecosystemContent, 'utf8');
    console.log('[postbuild] Written fresh ecosystem.config.js to fallback path:', ecosystemPath);
}

try {
    console.log('[postbuild] Inspecting processes holding port 5104 or 5105:');
    try {
        console.log(execSync('ps -ef | grep -E "node|5104|5105" || true').toString());
    } catch (e) {}

    console.log('[postbuild] Terminating user node processes on ports 5104/5105:');
    try {
        execSync('pkill -f "next start" || true');
        execSync('pkill -f "server.js" || true');
        execSync('kill -9 $(lsof -t -i:5104 -i:5105 2>/dev/null) 2>/dev/null || true');
    } catch (e) {}

    console.log('[postbuild] Resetting PM2 processes with clean start on ports 5104/5105...');
    try {
        execSync(`pm2 restart all --update-env || pm2 start ${ecosystemPath} --update-env || true`, { stdio: 'inherit' });
        execSync('pm2 save || true', { stdio: 'inherit' });
        console.log('[postbuild] PM2 restarted and saved successfully.');
    } catch (err) {
        console.warn('[postbuild] PM2 error:', err.message);
    }

    console.log('[postbuild] Waiting 3 seconds and checking PM2 logs...');
    try {
        execSync('sleep 3', { stdio: 'inherit' });
        console.log('--- PM2 describe crawl-data-frontend ---');
        console.log(execSync('pm2 describe crawl-data-frontend || true').toString());
        console.log('--- PM2 describe crawl-data-backend ---');
        console.log(execSync('pm2 describe crawl-data-backend || true').toString());
    } catch (e) {}

    console.log('[postbuild] PM2 status after clean start:');
    try {
        console.log(execSync('pm2 status || true').toString());
    } catch (e) {}
} catch (pm2Err) {
    console.warn('[postbuild] Note on PM2 restart:', pm2Err.message);
}
