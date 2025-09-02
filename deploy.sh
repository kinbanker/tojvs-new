#!/bin/bash

# tojvs Production Deployment Script
# This script helps deploy the application to production server

set -e  # Exit on error

echo "========================================="
echo "   tojvs Production Deployment Script"
echo "========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   print_error "Please don't run as root. Use a regular user with sudo privileges."
   exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 18 ]; then
    print_error "Node.js 18+ is required. Please install Node.js first."
    exit 1
fi
print_success "Node.js version check passed"

# 1. Backend Setup
echo ""
echo "Setting up Backend..."
echo "--------------------"

cd backend

# Create .env from template if not exists
if [ ! -f .env ]; then
    cp .env.template .env
    print_warning "Created .env from template."
    
    # Generate JWT Secret
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
    
    # Update .env file with generated JWT secret
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env
    else
        # Linux
        sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env
    fi
    
    print_success "Generated and set JWT_SECRET"
    print_warning "Please update N8N_WEBHOOK_URL in .env if different from https://n8n.sprint.kr"
fi

# Use the fixed server.js if exists
if [ -f server-fixed.js ]; then
    print_warning "Using server-fixed.js (with bug fixes)"
    cp server-fixed.js server.js
    print_success "Applied server fixes"
fi

# Install dependencies
print_warning "Installing backend dependencies..."
npm install
print_success "Backend dependencies installed"

cd ..

# 2. Frontend Setup
echo ""
echo "Setting up Frontend..."
echo "---------------------"

cd frontend

# Install dependencies
print_warning "Installing frontend dependencies..."
npm install
print_success "Frontend dependencies installed"

# Build for production
print_warning "Building frontend for production..."
NODE_ENV=production npm run build
print_success "Frontend built successfully"

cd ..

# 3. Database initialization
echo ""
echo "Initializing Database..."
echo "------------------------"

cd backend

# Remove old database if exists (optional)
read -p "Do you want to reset the database? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -f database.db
    print_success "Old database removed"
fi

cd ..

# 4. PM2 Setup
echo ""
echo "Setting up PM2..."
echo "-----------------"

# Check PM2
if ! command -v pm2 &> /dev/null; then
    print_warning "PM2 is not installed. Installing..."
    sudo npm install -g pm2
fi
print_success "PM2 is ready"

# Start backend with PM2
cd backend
pm2 stop tojvs-backend 2>/dev/null || true
pm2 start server.js --name tojvs-backend
pm2 save
print_success "Backend started with PM2"
cd ..

# 5. Nginx Configuration
echo ""
echo "Nginx Configuration..."
echo "----------------------"

# Check if nginx is installed
if ! command -v nginx &> /dev/null; then
    print_warning "Nginx is not installed. Installing..."
    sudo apt-get update
    sudo apt-get install -y nginx
fi

# Create nginx config
read -p "Enter your domain name (e.g., tojvs.com): " DOMAIN_NAME

if [ ! -z "$DOMAIN_NAME" ]; then
    sudo tee /etc/nginx/sites-available/tojvs > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN_NAME www.$DOMAIN_NAME;

    # Gzip compression
    gzip on;
    gzip_types text/plain application/json application/javascript text/css;
    gzip_min_length 1000;

    # Frontend
    location / {
        root $(pwd)/frontend/build;
        try_files \$uri \$uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    # WebSocket
    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }

    # n8n webhook endpoint
    location /webhook/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
    }
}
EOF

    # Enable site
    sudo ln -sf /etc/nginx/sites-available/tojvs /etc/nginx/sites-enabled/
    sudo nginx -t && sudo systemctl reload nginx
    print_success "Nginx configured for $DOMAIN_NAME"
    
    # SSL Setup
    read -p "Do you want to set up SSL with Let's Encrypt? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo apt-get install -y certbot python3-certbot-nginx
        sudo certbot --nginx -d $DOMAIN_NAME -d www.$DOMAIN_NAME
        print_success "SSL certificate installed"
    fi
fi

# 6. Firewall Setup
echo ""
echo "Firewall Configuration..."
echo "-------------------------"

sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw --force enable
print_success "Firewall configured"

# 7. PM2 Startup
echo ""
echo "Configuring PM2 Startup..."
echo "--------------------------"

pm2 startup systemd -u $USER --hp $HOME
pm2 save
print_success "PM2 startup configured"

# 8. Final Summary
echo ""
echo "========================================="
echo "   Deployment Complete!"
echo "========================================="
echo ""
echo "✅ Checklist:"
echo "  - Backend running on port 3001"
echo "  - Frontend built in frontend/build"
echo "  - PM2 managing backend process"
echo "  - Database initialized"
if [ ! -z "$DOMAIN_NAME" ]; then
    echo "  - Nginx configured for $DOMAIN_NAME"
fi
echo ""
echo "📝 Important Actions Required:"
echo ""
echo "1. Update backend/.env file:"
echo "   - Verify JWT_SECRET is set (auto-generated)"
echo "   - Update N8N_WEBHOOK_URL if needed"
echo "   - Set production CORS domains"
echo ""
echo "2. Configure n8n workflow at https://n8n.sprint.kr:"
echo "   - Create webhook: /webhook/tojvs-voice"
echo "   - Add OpenAI node for intent analysis"
echo "   - Configure result webhook to your server"
echo ""
echo "3. Update CORS in backend/server.js:"
echo "   - Replace 'tojvs.com' with your actual domain"
echo ""
echo "4. Monitor services:"
echo "   - PM2: pm2 monit"
echo "   - Logs: pm2 logs tojvs-backend"
echo "   - Health: curl http://localhost:3001/api/health"
echo ""
if [ ! -z "$DOMAIN_NAME" ]; then
    echo "5. Access your application:"
    echo "   - http://$DOMAIN_NAME"
fi
echo ""
print_success "Deployment script completed!"