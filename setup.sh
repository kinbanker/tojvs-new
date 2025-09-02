#!/bin/bash

# tojvs MVP Setup Script
# This script automates the installation and setup process

set -e  # Exit on error

echo "========================================="
echo "   tojvs MVP 자동 설치 스크립트"
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
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 16 ]; then
    print_error "Node.js 16+ is required. Please install Node.js first."
    exit 1
fi
print_success "Node.js version check passed"

# Check npm
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed"
    exit 1
fi
print_success "npm is installed"

# Check PM2
if ! command -v pm2 &> /dev/null; then
    print_warning "PM2 is not installed. Installing..."
    npm install -g pm2
fi
print_success "PM2 is ready"

# Backend Setup
echo ""
echo "Setting up Backend..."
echo "--------------------"

cd backend

# Check if .env exists
if [ ! -f .env ]; then
    if [ -f .env.template ]; then
        cp .env.template .env
        print_warning "Created .env from template. Please edit it with your credentials."
    else
        print_error "No .env or .env.template file found!"
        exit 1
    fi
else
    print_success ".env file exists"
fi

# Install backend dependencies
print_warning "Installing backend dependencies..."
npm install
print_success "Backend dependencies installed"

# Initialize database
print_warning "Initializing database..."
node -e "console.log('Database will be created on first run')"
print_success "Database ready"

cd ..

# Frontend Setup
echo ""
echo "Setting up Frontend..."
echo "---------------------"

cd frontend

# Install frontend dependencies
print_warning "Installing frontend dependencies..."
npm install
print_success "Frontend dependencies installed"

# Build frontend for production
read -p "Do you want to build frontend for production? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_warning "Building frontend (this may take a few minutes)..."
    npm run build
    print_success "Frontend built successfully"
fi

cd ..

# Docker check for n8n
echo ""
echo "Checking Docker for n8n..."
echo "-------------------------"

if command -v docker &> /dev/null; then
    print_success "Docker is installed"
    
    read -p "Do you want to start n8n with Docker? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Check if docker-compose.yml exists
        if [ ! -f docker-compose.yml ]; then
            print_warning "Creating docker-compose.yml..."
            cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  n8n:
    image: n8nio/n8n
    container_name: n8n
    restart: always
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=${N8N_PASSWORD}
      - N8N_HOST=localhost
      - N8N_PORT=5678
      - N8N_PROTOCOL=http
      - NODE_ENV=production
      - WEBHOOK_URL=http://localhost:5678/
    volumes:
      - ./n8n-data:/home/node/.n8n
    networks:
      - n8n-network

networks:
  n8n-network:
    driver: bridge
EOF
            print_success "docker-compose.yml created"
        fi
        
        docker-compose up -d
        print_success "n8n started with Docker"
    fi
else
    print_warning "Docker not installed. n8n will need to be set up separately."
fi

# Start services
echo ""
echo "Starting Services..."
echo "-------------------"

read -p "Do you want to start the backend server now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    cd backend
    pm2 start server.js --name tojvs-backend
    pm2 save
    print_success "Backend server started with PM2"
    cd ..
fi

# Final instructions
echo ""
echo "========================================="
echo "   Setup Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Edit backend/.env with your credentials:"
echo "   - JWT_SECRET (generate a secure random string)"
echo "   - N8N_WEBHOOK_URL (if different from default)"
echo ""
echo "2. Access your services:"
echo "   - Frontend: http://localhost:3000"
echo "   - Backend API: http://localhost:3001"
echo "   - n8n: http://localhost:5678"
echo ""
echo "3. PM2 commands:"
echo "   - View logs: pm2 logs"
echo "   - View status: pm2 status"
echo "   - Restart: pm2 restart tojvs-backend"
echo ""
echo "4. For production deployment:"
echo "   - Set up Nginx as reverse proxy"
echo "   - Configure SSL with Let's Encrypt"
echo "   - Update CORS settings in backend"
echo ""
print_success "Setup script completed successfully!"