#!/bin/bash

# TOJVS Enhanced Deployment Script
# Supports initial setup, updates, and development mode

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

# Function to load environment variables from .env file
load_env() {
    local env_file="$1"
    if [ -f "$env_file" ]; then
        # Export variables from .env file
        set -a
        source "$env_file"
        set +a
        log_success "Loaded environment variables from $env_file"
    else
        log_error ".env file not found at $env_file"
        log_error "Please create the .env file first before running this script"
        exit 1
    fi
}

# Parse command line arguments
INIT_MODE=false
UPDATE_MODE=false
DEV_MODE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --init|-i)
            INIT_MODE=true
            shift
            ;;
        --update|-u)
            UPDATE_MODE=true
            shift
            ;;
        --dev|-d)
            DEV_MODE=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo ""
            echo "Usage: $0 [--init] [--update] [--dev]"
            echo ""
            echo "Options:"
            echo "  --init, -i    Initial server setup"
            echo "  --update, -u  Regular update deployment"
            echo "  --dev, -d     Development mode"
            echo ""
            echo "Examples:"
            echo "  $0 --init --dev    # Initial setup + development mode"
            echo "  $0 --dev          # Development mode only"
            echo "  $0 --update       # Update deployment"
            echo ""
            exit 1
            ;;
    esac
done

# Validate arguments
if [[ "$INIT_MODE" == false && "$UPDATE_MODE" == false && "$DEV_MODE" == false ]]; then
    echo "Error: At least one mode must be specified"
    echo ""
    echo "Usage: $0 [--init] [--update] [--dev]"
    exit 1
fi

# Determine primary mode for display
DEPLOYMENT_MODE=""
if [[ "$INIT_MODE" == true && "$DEV_MODE" == true ]]; then
    DEPLOYMENT_MODE="init+dev"
elif [[ "$INIT_MODE" == true ]]; then
    DEPLOYMENT_MODE="init"
elif [[ "$UPDATE_MODE" == true ]]; then
    DEPLOYMENT_MODE="update"
elif [[ "$DEV_MODE" == true ]]; then
    DEPLOYMENT_MODE="dev"
fi

echo "========================================="
echo "   TOJVS Deployment Script ($DEPLOYMENT_MODE)"
echo "========================================="

# Move to project root
cd ~/tojvs/tojvs-dev

# Create logs directory if not exists
mkdir -p logs

# Load environment variables from existing .env file
log_info "Loading environment variables from backend/.env..."
load_env "./backend/.env"

# Validate required environment variables
validate_env_vars() {
    local required_vars=("NODE_ENV" "PORT" "JWT_SECRET")
    local missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            missing_vars+=("$var")
        fi
    done
    
    if [ ${#missing_vars[@]} -ne 0 ]; then
        log_error "Missing required environment variables in .env file:"
        for var in "${missing_vars[@]}"; do
            echo "  - $var"
        done
        exit 1
    fi
    
    log_success "All required environment variables are present"
}

# Create ecosystem config files
create_ecosystem_configs() {
    log_info "Creating PM2 ecosystem configuration files using existing .env variables..."
    
    # Production ecosystem config (백엔드만, 프론트엔드는 정적 파일로 Nginx가 서빙)
    cat > ecosystem.config.js << EOF
module.exports = {
  apps: [
    {
      name: 'tojvs-backend',
      script: './backend/server.js',
      cwd: process.env.PWD,
      watch: false,
      ignore_watch: ['node_modules', 'logs', '*.log', 'database.db', '.git'],
      max_restarts: 10,
      min_uptime: 10000,
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      merge_logs: true,
      time: true,
      env_file: './backend/.env',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    }
  ]
};
EOF

    # Development ecosystem config (백엔드: 3002, 프론트엔드: 3000)
    cat > ecosystem.dev.config.js << EOF
module.exports = {
  apps: [
    {
      name: 'tojvs-dev-backend',
      script: './backend/server.js',
      cwd: process.env.PWD,
      watch: true,
      ignore_watch: ['node_modules', 'logs', '*.log', 'database.db', '.git', 'frontend'],
      watch_delay: 1000,
      max_restarts: 5,
      min_uptime: 5000,
      error_file: './logs/dev-backend-error.log',
      out_file: './logs/dev-backend-out.log',
      merge_logs: true,
      time: true,
      env_file: './backend/.env',
      env: {
        NODE_ENV: 'development',
        PORT: 3002
      }
    },
    {
      name: 'tojvs-dev-frontend',
      script: 'npm',
      args: 'start',
      cwd: './frontend',
      watch: false,
      max_restarts: 5,
      min_uptime: 5000,
      error_file: './logs/dev-frontend-error.log',
      out_file: './logs/dev-frontend-out.log',
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        BROWSER: 'none'
      }
    }
  ]
};
EOF
    
    log_success "Ecosystem configuration files created with correct port configuration"
    log_info "Production: Backend(3001), Frontend(Static files via Nginx)"
    log_info "Development: Backend(3002), Frontend(3000)"
}

# Function to create frontend .env from backend .env if not exists
create_frontend_env() {
    if [ ! -f "./frontend/.env" ]; then
        log_info "Creating frontend .env for development environment..."
        
        # 개발환경에서는 백엔드가 3002포트를 사용
        local backend_port="3002"
        if [[ "$NODE_ENV" == "production" ]]; then
            backend_port="3001"
        fi
        
        cat > ./frontend/.env << EOF
REACT_APP_API_URL=http://localhost:${backend_port}
REACT_APP_SOCKET_URL=http://localhost:${backend_port}
REACT_APP_ENV=${NODE_ENV:-development}
EOF
        log_success "Created frontend .env (API: localhost:${backend_port})"
    else
        log_info "Frontend .env already exists, skipping creation"
    fi
}

# Production build function
build_for_production() {
    log_info "Building frontend for production..."
    cd frontend
    
    # 프로덕션용 환경변수로 빌드
    REACT_APP_API_URL="http://localhost:3001" \
    REACT_APP_SOCKET_URL="http://localhost:3001" \
    REACT_APP_ENV="production" \
    npm run build
    
    log_success "Frontend production build completed"
    cd ..
}

# Initial setup function
run_init_setup() {
    echo ""
    echo "🚀 INITIAL SETUP"
    echo "================"
    
    # Node.js version check
    NODE_VERSION=$(node -v 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
    if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 18 ]; then
        log_error "Node.js 18+ is required. Please install Node.js first."
        exit 1
    fi
    log_success "Node.js version check passed"
    
    # Validate environment variables
    validate_env_vars
    
    # Backend setup
    log_info "Setting up backend..."
    cd backend
    
    # Check if .env exists (already loaded, just verify it's there)
    if [ ! -f .env ]; then
        log_error "Backend .env file is missing. Please create it first."
        exit 1
    fi
    log_info "Using existing backend .env file"
    
    npm install
    log_success "Backend dependencies installed"
    
    # Frontend setup
    cd ../frontend
    log_info "Setting up frontend..."
    
    npm install
    log_success "Frontend dependencies installed"
    
    # Create frontend .env if needed
    cd ..
    create_frontend_env
    
    # PM2 setup
    log_info "Setting up PM2..."
    
    if ! command -v pm2 &> /dev/null; then
        log_warning "Installing PM2..."
        sudo npm install -g pm2
    fi
    
    log_success "Initial setup completed"
}

# Development mode function
run_dev_mode() {
    echo ""
    echo "🔧 DEVELOPMENT MODE"
    echo "==================="
    
    # Validate environment variables
    validate_env_vars
    
    # Create ecosystem configs
    create_ecosystem_configs
    
    # Ensure we're in the right directory
    cd ~/tojvs/tojvs-dev
    
    # Check backend dependencies
    log_info "Checking backend dependencies..."
    cd backend
    if [ ! -d "node_modules" ]; then
        npm install
    fi
    
    # Verify backend .env exists (already loaded)
    if [ ! -f .env ]; then
        log_error "Backend .env file is missing. Please create it first."
        exit 1
    fi
    log_info "Using existing backend .env file"
    
    log_info "Checking frontend dependencies..."
    cd ../frontend
    if [ ! -d "node_modules" ]; then
        npm install
    fi
    
    cd ..
    
    # Create frontend .env if needed
    create_frontend_env
    
    # Stop existing dev processes
    log_info "Stopping existing development processes..."
    pm2 delete tojvs-dev-backend 2>/dev/null || true
    pm2 delete tojvs-dev-frontend 2>/dev/null || true
    
    # Clear PM2 logs to avoid confusion
    log_info "Clearing old PM2 logs..."
    pm2 flush
    
    # Start with dev ecosystem config
    log_info "Starting development servers..."
    pm2 start ecosystem.dev.config.js
    pm2 save
    
    # Wait a moment for services to start
    log_info "Waiting for services to initialize..."
    sleep 5
    
    # Check if services started successfully
    backend_status=$(pm2 jlist | jq -r '.[] | select(.name=="tojvs-dev-backend") | .pm2_env.status' 2>/dev/null || echo "unknown")
    frontend_status=$(pm2 jlist | jq -r '.[] | select(.name=="tojvs-dev-frontend") | .pm2_env.status' 2>/dev/null || echo "unknown")
    
    if [[ "$backend_status" == "online" ]]; then
        log_success "Backend server started successfully!"
    else
        log_warning "Backend server status: $backend_status"
    fi
    
    if [[ "$frontend_status" == "online" ]]; then
        log_success "Frontend server started successfully!"
    else
        log_warning "Frontend server status: $frontend_status"
    fi
    
    echo ""
    echo "🌐 Access points:"
    echo "  Frontend (Development): http://localhost:3000"
    echo "  Backend (Development):  http://localhost:3002"
    echo ""
    echo "📋 PM2 Commands:"
    echo "  Status:   pm2 status"
    echo "  Logs:     pm2 logs"
    echo "  Stop:     pm2 stop all"
    echo "  Restart:  pm2 restart all"
    echo "  Kill:     pm2 kill"
    echo ""
    echo "🔧 Development Tips:"
    echo "  - Code changes require manual restart: pm2 restart tojvs-dev-backend"
    echo "  - For full restart: ./deploy-dev.sh --dev"
    echo "  - Check ports: netstat -tuln | grep -E ':(3000|3002)'"
    echo ""
    
    # Show current status
    pm2 status
    echo ""
    
    # Show initial logs
    log_info "Recent logs (last 10 lines):"
    pm2 logs --lines 10 --nostream
    echo ""
    log_info "Use 'pm2 logs' for real-time log monitoring"
}

# Production mode function
run_production_mode() {
    echo ""
    echo "🚀 PRODUCTION MODE"
    echo "=================="
    
    # Validate environment variables
    validate_env_vars
    
    # Build frontend for production
    build_for_production
    
    # Create ecosystem configs
    create_ecosystem_configs
    
    # Stop existing production processes
    log_info "Stopping existing production processes..."
    pm2 delete tojvs-backend 2>/dev/null || true
    
    # Start with production ecosystem config
    log_info "Starting production backend server..."
    pm2 start ecosystem.config.js
    pm2 save
    
    # Wait a moment for service to start
    sleep 3
    
    log_success "Production backend server started!"
    echo ""
    echo "🌐 Production configuration:"
    echo "  Backend:  http://localhost:3001"
    echo "  Frontend: Static files in ./frontend/build/ (serve via Nginx)"
    echo ""
    echo "📋 PM2 Commands:"
    echo "  Status:  pm2 status"
    echo "  Logs:    pm2 logs"
    echo "  Stop:    pm2 stop all"
    echo "  Restart: pm2 restart all"
    echo ""
    
    # Show current status
    pm2 status
}

# Execute based on selected modes
if [[ "$INIT_MODE" == true ]]; then
    run_init_setup
fi

if [[ "$DEV_MODE" == true ]]; then
    run_dev_mode
elif [[ "$NODE_ENV" == "production" ]]; then
    # 환경변수가 production이면 프로덕션 모드로 실행
    run_production_mode
fi

if [[ "$UPDATE_MODE" == true ]]; then
    echo ""
    echo "🔄 UPDATE MODE"
    echo "=============="
    
    if [[ "$UPDATE_MODE" == true ]]; then
        log_info "Updating production environment..."
        build_for_production
        create_ecosystem_configs
        safe_stop_processes "tojvs-backend"
        pm2 start ecosystem.config.js
        log_success "Production update completed"
    else
        log_info "Updating development environment..."
        safe_stop_processes "tojvs-dev-backend" "tojvs-dev-frontend"
        sleep 2
        pm2 start ecosystem.dev.config.js
        log_success "Development update completed"
    fi
fi

echo ""
echo "========================================="
echo "   Deployment Complete!"
echo "========================================="
echo ""
echo "📋 Quick Commands:"
echo "  pm2 status         - Check service status"
echo "  pm2 logs           - View all logs"
echo "  pm2 monit          - Real-time monitoring"
echo "  pm2 restart all    - Restart all services"
echo ""

# 포트 정보 요약
if [[ "$DEV_MODE" == true ]]; then
    echo "🔧 Development Environment:"
    echo "  Backend:  localhost:3002"
    echo "  Frontend: localhost:3000"
elif [[ "$NODE_ENV" == "production" ]]; then
    echo "🚀 Production Environment:"
    echo "  Backend:  localhost:3001"
    echo "  Frontend: Static files (serve via Nginx)"
fi
echo ""