#!/bin/bash

# TOJVS Unified Deployment Script
# Supports both initial setup and regular updates

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check deployment mode
DEPLOYMENT_MODE=""
if [ "$1" = "--init" ] || [ "$1" = "-i" ]; then
    DEPLOYMENT_MODE="init"
elif [ "$1" = "--update" ] || [ "$1" = "-u" ]; then
    DEPLOYMENT_MODE="update"
else
    echo "Usage: $0 [--init|--update]"
    echo ""
    echo "Options:"
    echo "  --init, -i    Initial server setup (first time deployment)"
    echo "  --update, -u  Regular update deployment"
    echo ""
    exit 1
fi

echo "========================================="
echo "   TOJVS Deployment Script ($DEPLOYMENT_MODE)"
echo "========================================="

# Move to project root
cd ~/tojvs/tojvs-dev

if [ "$DEPLOYMENT_MODE" = "init" ]; then
    echo ""
    echo "🚀 INITIAL SETUP MODE"
    echo "====================="
    
    # Node.js version check
    NODE_VERSION=$(node -v 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
    if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 18 ]; then
        log_error "Node.js 18+ is required. Please install Node.js first."
        exit 1
    fi
    log_success "Node.js version check passed"
    
    # Backend setup
    log_info "Setting up backend..."
    cd backend
    
    # Create .env if not exists
    if [ ! -f .env ]; then
        if [ -f .env.template ]; then
            cp .env.template .env
        else
            cat > .env << EOF
NODE_ENV=production
PORT=3001
JWT_SECRET=CHANGE_THIS_SECRET
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
ALLOWED_DOMAINS=tojvs.com,www.tojvs.com
N8N_WEBHOOK_URL=https://n8n.sprint.kr/webhook/tojvs-voice
EOF
        fi
        
        # Generate JWT Secret
        JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env
        else
            sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env
        fi
        
        log_success "Created .env with generated JWT_SECRET"
        log_warning "Please review and update .env file as needed"
    fi
    
    npm install
    log_success "Backend dependencies installed"
    
    # Frontend setup
    cd ../frontend
    log_info "Setting up frontend..."
    npm install
    NODE_ENV=production npm run build
    log_success "Frontend built for production"
    
    # PM2 setup
    cd ../backend
    log_info "Setting up PM2..."
    
    if ! command -v pm2 &> /dev/null; then
        log_warning "Installing PM2..."
        sudo npm install -g pm2
    fi
    
    pm2 stop tojvs-backend 2>/dev/null || true
    pm2 start server.js --name tojvs-backend
    pm2 startup systemd -u $USER --hp $HOME || true
    pm2 save
    log_success "PM2 configured and backend started"
    
    # Nginx setup
    log_info "Nginx configuration..."
    read -p "Enter your domain name (e.g., tojvs.com) or press Enter to skip: " DOMAIN_NAME
    
    if [ ! -z "$DOMAIN_NAME" ]; then
        if ! command -v nginx &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y nginx
        fi
        
        sudo tee /etc/nginx/sites-available/tojvs > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN_NAME www.$DOMAIN_NAME;

    gzip on;
    gzip_types text/plain application/json application/javascript text/css;

    location / {
        root $(pwd)/../frontend/build;
        try_files \$uri \$uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }
}
EOF
        
        sudo ln -sf /etc/nginx/sites-available/tojvs /etc/nginx/sites-enabled/
        sudo nginx -t && sudo systemctl reload nginx
        log_success "Nginx configured for $DOMAIN_NAME"
        
        # SSL setup
        read -p "Set up SSL with Let's Encrypt? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            sudo apt-get install -y certbot python3-certbot-nginx
            sudo certbot --nginx -d $DOMAIN_NAME -d www.$DOMAIN_NAME
            log_success "SSL certificate installed"
        fi
    fi
    
    # Firewall
    log_info "Configuring firewall..."
    sudo ufw allow 22/tcp 80/tcp 443/tcp
    sudo ufw --force enable
    log_success "Firewall configured"
    
    cd ~/tojvs/tojvs-dev
    log_success "Initial setup completed!"
    echo ""
    echo "Next steps:"
    echo "1. Review backend/.env file"
    echo "2. Configure your domain's DNS"
    echo "3. Test the application"
    
elif [ "$DEPLOYMENT_MODE" = "update" ]; then
    echo ""
    echo "🔄 UPDATE MODE"
    echo "=============="
    
    # Check for local changes
    if [[ -n $(git status --porcelain) ]]; then
        log_warning "Local changes detected. Stashing them..."
        git stash
    fi
    
    # Pull latest code
    log_info "Pulling latest code from develop branch..."
    git checkout develop
    git pull origin develop
    
    # Check if package.json changed
    BACKEND_DEPS_CHANGED=false
    FRONTEND_DEPS_CHANGED=false
    
    if git diff --name-only HEAD~1 | grep -q "backend/package.json"; then
        BACKEND_DEPS_CHANGED=true
    fi
    
    if git diff --name-only HEAD~1 | grep -q "frontend/package.json"; then
        FRONTEND_DEPS_CHANGED=true
    fi
    
    # Backend update
    log_info "Updating backend..."
    cd backend
    
    if [ "$BACKEND_DEPS_CHANGED" = true ]; then
        log_info "Installing backend dependencies..."
        npm install
    fi
    
    pm2 restart tojvs-dev-backend || pm2 restart tojvs-backend
    log_success "Backend restarted"
    
    # Frontend update
    log_info "Updating frontend..."
    cd ../frontend
    
    if [ "$FRONTEND_DEPS_CHANGED" = true ]; then
        log_info "Installing frontend dependencies..."
        npm install
    fi
    
    log_info "Building frontend..."
    npm run build
    log_success "Frontend built"
    
    # Clear caches
    log_info "Clearing caches..."
    sudo rm -rf /var/cache/nginx/* 2>/dev/null || true
    sudo systemctl reload nginx 2>/dev/null || true
    
    # Status check
    cd ~/tojvs/tojvs-dev
    log_info "Checking server status..."
    pm2 status
    
    echo ""
    log_success "Update deployment completed!"
    log_warning "Clear your browser cache (Ctrl+F5 or Cmd+Shift+R)"
    
    # Show recent logs
    log_info "Recent backend logs:"
    pm2 logs tojvs-dev-backend --lines 5 2>/dev/null || pm2 logs tojvs-backend --lines 5
fi

echo ""
echo "========================================="
echo "   Deployment Complete!"
echo "========================================="