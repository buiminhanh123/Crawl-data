# 10 — VPS Deployment & CI/CD

Automate application deployment to a Virtual Private Server (VPS) using GitHub Actions, PM2, and Nginx. This guide covers how to set up the CI/CD pipeline and configure the server environments.

## Architecture Overview

A secure, automated workflow keeps credentials encrypted on GitHub while running tests and deploys automatically upon code updates:
1. **Developer** pushes code to the `main` branch on GitHub.
2. **GitHub Actions** triggers the workflow, runs building tasks, and establishes an SSH connection to the VPS using an SSH Key stored in GitHub Secrets.
3. **VPS Server** pulls the latest changes, runs installations, builds, and triggers PM2 to reload the app with zero downtime.

---

## Step 1: VPS Server Setup

Log in to your VPS via SSH and complete these configuration steps:

### A. Directory Structure
We recommend organizing your web applications under `/var/www/`:
```bash
sudo mkdir -p /var/www/{APP_NAME}
sudo chown -R $USER:$USER /var/www/{APP_NAME}
cd /var/www/{APP_NAME}
```

### B. Clone the Repository Lần Đầu
Clone the empty GitHub repository into the deployment folder:
```bash
git clone git@github.com:{GITHUB_USER}/{REPO_NAME}.git .
```

### C. Create Environment Variables (`.env`)
Environment variables should not be committed to GitHub. Run this command at the project root folder on the VPS to create it automatically (or use `nano .env`):
```bash
cat <<EOT > .env
PORT={BACKEND_PORT}
NEXT_PUBLIC_API_URL=https://{DOMAIN}/api
EOT
```

### D. Nginx Domain Connection
Create Nginx configuration files for your domain under `/etc/nginx/sites-available/`:
```bash
sudo nano /etc/nginx/sites-available/{APP_NAME}.conf
```

**Nginx Configuration Template (Single Domain Configuration - Next.js + Express unified):**
Routes `/api/` requests to backend (port 3002) and others to frontend (port 3000):
```nginx
server {
    listen 80;
    server_name domain-cua-ban.com;

    location /api/ {
        proxy_pass http://localhost:3002; # Express backend port
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        proxy_pass http://localhost:3000; # Next.js frontend port
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable the configuration and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/{APP_NAME}.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### E. Install SSL (Certbot)
Enable free HTTPS using Let's Encrypt Certbot:
```bash
sudo certbot --nginx -d domain-cua-ban.com
```

### F. Check running ports on VPS
Before assigning a port to your new app, ensure it is vacant by running one of these commands on your VPS:
* **Show listening sockets and associated process names:**
  `sudo ss -tunlp`
* **Show list of files/processes listening to ports:**
  `sudo lsof -i -P -n | grep LISTEN`
* **Show PM2 running application list:**
  `pm2 status`

---

## Step 2: GitHub Repository Configuration

Go to your repository on GitHub, then navigate to **Settings** > **Secrets and variables** > **Actions** > **New repository secret**.

Add the following secret keys:
* `VPS_HOST`: The IP address of your VPS.
* `VPS_USER`: SSH login username (e.g. `root` or custom sudo-enabled user).
* `VPS_SSH_KEY`: The SSH Private Key.

**Command to generate SSH Key and print details for copy-pasting:**
```bash
# 1. Ensure .ssh directory exists and is secured
mkdir -p ~/.ssh && chmod 700 ~/.ssh

# 2. Generate SSH key pair without passphrase
ssh-keygen -t ed25519 -f ~/.ssh/github_actions_key -N "" -q

# 3. Add public key to authorized_keys on VPS
cat ~/.ssh/github_actions_key.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# 4. Display values to copy
echo "=== PUBLIC KEY (Saved to authorized_keys) ==="
cat ~/.ssh/github_actions_key.pub
echo -e "\n=== PRIVATE KEY (Copy this to GitHub Actions Secrets 'VPS_SSH_KEY') ==="
cat ~/.ssh/github_actions_key
```

---

## Step 3: CI/CD Deployment Files (Project Configuration)

To enable automatic deployment, include these two files in your project directory:

### A. PM2 Ecosystem File (`ecosystem.config.js`)
Create this file in the root of your project:
```javascript
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
        PORT: 3000
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};
```

### B. GitHub Actions Workflow (`.github/workflows/deploy.yml`)
Create this file under the `.github/workflows/` folder:
```yaml
name: Deploy Web Application to VPS

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Check for hardcoded localhost in frontend code
        run: |
          echo "Checking for hardcoded localhost API endpoints..."
          if grep -rni --exclude-dir={node_modules,.next,out} --include=\*.{js,jsx,ts,tsx} "http://localhost" ./frontend; then
            echo "::error::Phat hien duong dan tuyet doi localhost trong code frontend! Vui long su dung duong dan tuong doi '/api' de code co the chay dung tren production."
            exit 1
          fi
          echo "No absolute localhost paths found. Validation passed!"

      - name: Build project
        run: npm run build --if-present

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          port: 22
          script: |
            cd /var/www/{APP_NAME}
            
            # Fetch & hard reset to origin/main
            git fetch --all
            git reset --hard origin/main
            
            # Reinstall production packages
            npm install --production
            
            # Rebuild project
            npm run build --if-present
            
            # Reload PM2 application
            pm2 restart {APP_NAME} --update-env || pm2 start ecosystem.config.js
            
            echo "Deployment successful."
```

---

## Step 4: Sharing & Running CI/CD

Once the workflow is in place:
1. Invite developer team members to collaborate on the GitHub repository.
2. Developers work locally on feature branches.
3. They pull, build, and test locally.
4. When features are complete, developers submit a Pull Request or merge changes into the `main` branch.
5. Pushing to `main` auto-triggers the GitHub Actions workflow, updating and restarting the site on your VPS within seconds.

---

## Step 5: Handoff Prompt Template (For Developers & Antigravity AI)

When starting a new project, copy the following prompt, fill in the placeholder values, and send it to the developer. The developer (or their AI assistant) can copy-paste it directly to set up deployment automatically:

```markdown
Bối cảnh dự án:
Chúng ta cần khởi tạo và cấu hình dự án mới "{APP_NAME}" dựa theo tiêu chuẩn DACO. 
Dự án này sẽ được kết nối lên GitHub và tự động deploy lên VPS qua CI/CD Actions.

Thông số cấu hình dự án (Admin cung cấp):
- Tên dự án: {APP_NAME}
- GitHub Repository Link (Đã cấu hình Secrets): {GITHUB_REPO_LINK}
- Môi trường Production (VPS):
  - Domain chính (Tên miền): {DOMAIN} (Chạy Frontend ở port: {FRONTEND_PORT}, Backend ở port: {BACKEND_PORT})

Yêu cầu thực hiện bằng Antigravity:
1. Đọc và làm theo hướng dẫn khởi tạo trong file: daco-webapp-builder/skills/01-project-init.md để tạo source code cơ bản (Frontend Next.js + Server Express).
2. Đảm bảo sao chép các file cấu hình deploy từ thư mục templates:
   - templates/deploy/deploy.yml -> .github/workflows/deploy.yml
   - templates/deploy/ecosystem.config.js -> ecosystem.config.js
3. Tiến hành cấu hình dự án khớp với thông số VPS:
   - Thay thế toàn bộ placeholder {APP_NAME} trong code và file deploy bằng: {APP_NAME}
   - Thay thế {PORT} trong file ecosystem.config.js bằng: {FRONTEND_PORT}
   - Trong code server backend (Express), đảm bảo port production chạy ở cổng: {BACKEND_PORT}
   - Cập nhật biến API URL trong frontend/.env.local ở local là: http://localhost:{BACKEND_PORT}
   - Đảm bảo khi deploy lên production, Next.js sẽ gọi API qua đường dẫn tương đối: /api (không cần điền tên miền)
4. Chạy lệnh "npm install" tại thư mục gốc của dự án ở máy local để cài đặt thư viện và tự động sinh ra file package-lock.json. Sau đó chạy build thử ở local (npm run build) để chắc chắn không có lỗi TypeScript hay compile.
5. Tạo Git local, commit toàn bộ code (bao gồm cả file package-lock.json vừa được tạo) và push lên nhánh main của repository: {GITHUB_REPO_LINK} để kích hoạt CI/CD tự động deploy lên VPS.
```
