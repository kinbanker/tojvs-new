const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const validator = require('validator');
const { open } = require('sqlite'); // 누락된 import 추가
const sqlite3 = require('sqlite3'); // 누락된 import 추가
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Environment validation
const requiredEnvVars = ['JWT_SECRET', 'NODE_ENV'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

// Environment variables (no defaults for sensitive data)
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const NODE_ENV = process.env.NODE_ENV;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || '';
const ALLOWED_DOMAINS = process.env.ALLOWED_DOMAINS ? 
  process.env.ALLOWED_DOMAINS.split(',').map(d => d.trim()) : 
  ['tojvs.com', 'www.tojvs.com', 'dev.tojvs.com']; // 기본값 설정

// Production check
const isProduction = NODE_ENV === 'production';

// Allowed origins configuration - 개선된 버전
const getAllowedOrigins = () => {
  const origins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    // 개발 환경을 위한 추가 주소
    'http://localhost:8080',
    'http://localhost:8000',
    'http://0.0.0.0:3000'
  ];
  
  // Add custom domains from environment
  if (ALLOWED_DOMAINS && ALLOWED_DOMAINS.length > 0) {
    ALLOWED_DOMAINS.forEach(domain => {
      // HTTP와 HTTPS 모두 추가
      origins.push(`http://${domain}`);
      origins.push(`https://${domain}`);
      
      // www 서브도메인 자동 추가 (이미 www가 아닌 경우)
      if (!domain.startsWith('www.')) {
        origins.push(`http://www.${domain}`);
        origins.push(`https://www.${domain}`);
      }
      
      // 포트 번호가 있는 경우 처리
      if (domain.includes(':')) {
        const baseDomain = domain.split(':')[0];
        origins.push(`http://${baseDomain}`);
        origins.push(`https://${baseDomain}`);
      }
    });
  }
  
  // Add server IP if provided
  if (process.env.SERVER_IP) {
    origins.push(`http://${process.env.SERVER_IP}`);
    origins.push(`https://${process.env.SERVER_IP}`);
    origins.push(`http://${process.env.SERVER_IP}:3000`);
    origins.push(`http://${process.env.SERVER_IP}:3001`);
  }
  
  // 중복 제거 및 정렬
  const uniqueOrigins = [...new Set(origins)];
  console.log('📍 Allowed Origins:', uniqueOrigins);
  return uniqueOrigins;
};

// Security middleware with proper CSP
app.use(helmet({
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", ...getAllowedOrigins()],
      scriptSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline only if necessary
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: isProduction ? [] : null
    }
  } : false,
  crossOriginEmbedderPolicy: false
}));

// Rate limiting with different limits for different endpoints
const createRateLimiter = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message,
  skip: (req) => !isProduction // Skip in development
});

const apiLimiter = createRateLimiter(15 * 60 * 1000, 100, '너무 많은 요청입니다.');
const authLimiter = createRateLimiter(15 * 60 * 1000, 5, '너무 많은 인증 시도입니다.');
const voiceLimiter = createRateLimiter(60 * 1000, 10, '음성 명령 한도를 초과했습니다.');

app.use('/api/', apiLimiter);
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

// CORS 옵션 설정 - 개선된 버전
const corsOptions = {
  origin: function(origin, callback) {
    const allowedOrigins = getAllowedOrigins();
    
    // 개발 환경에서는 origin이 없는 요청도 허용 (Postman, curl 등)
    if (!origin && NODE_ENV === 'development') {
      console.log('✅ CORS: Allowing request without origin (development)');
      return callback(null, true);
    }
    
    // origin이 없는 경우 (같은 도메인 요청)
    if (!origin) {
      console.log('✅ CORS: Allowing same-origin request');
      return callback(null, true);
    }
    
    // 허용된 origin인지 확인
    if (allowedOrigins.includes(origin)) {
      console.log(`✅ CORS: Allowing origin: ${origin}`);
      callback(null, true);
    } else {
      console.warn(`❌ CORS: Blocking origin: ${origin}`);
      console.warn(`📋 Allowed origins:`, allowedOrigins);
      callback(new Error(`CORS policy: ${origin} is not allowed`), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With', 
    'Content-Type', 
    'Accept',
    'Authorization',
    'Cache-Control',
    'Pragma'
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400, // 24시간 preflight 캐시
  optionsSuccessStatus: 200 // IE11 호환성
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Socket.io 설정 개선 - 더 견고한 버전
const io = socketIO(server, {
  cors: {
    origin: function(origin, callback) {
      const allowedOrigins = getAllowedOrigins();
      
      console.log(`🔌 Socket.IO connection attempt from: ${origin || 'same-origin'}`);
      
      // 개발 환경 또는 origin이 없는 경우
      if (!origin || NODE_ENV === 'development') {
        console.log('✅ Socket.IO: Allowing connection (development or same-origin)');
        return callback(null, true);
      }
      
      // 허용된 origin 확인
      if (allowedOrigins.includes(origin)) {
        console.log(`✅ Socket.IO: Allowing origin: ${origin}`);
        callback(null, true);
      } else {
        console.warn(`❌ Socket.IO: Blocking origin: ${origin}`);
        console.warn(`📋 Socket.IO allowed origins:`, allowedOrigins);
        callback(null, false); // Socket.IO는 에러 대신 false 반환
      }
    },
    credentials: true,
    methods: ["GET", "POST"],
    allowedHeaders: [
      "authorization",
      "content-type",
      "x-requested-with",
      "accept",
      "origin",
      "user-agent",
      "cache-control"
    ],
  },
  
  // 연결 설정 - 더 안정적인 값들
  pingTimeout: 60000,        // 60초
  pingInterval: 25000,       // 25초
  connectTimeout: 45000,     // 연결 타임아웃 45초
  
  // 전송 방식 설정
  transports: ['polling', 'websocket'], // polling을 먼저 시도
  allowUpgrades: true,       // WebSocket으로 업그레이드 허용
  upgradeTimeout: 10000,     // 업그레이드 타임아웃 10초
  
  // 추가 옵션
  allowEIO3: true,           // Engine.IO v3 호환성 (Socket.IO v2 클라이언트)
  maxHttpBufferSize: 1e6,    // 1MB
  
  // 경로 설정
  path: '/socket.io/',
  
  // 서버 옵션
  serveClient: false,        // 클라이언트 파일 서빙 비활성화
  
  // 압축 설정
  compression: true,
  perMessageDeflate: {
    threshold: 1024,         // 1KB 이상일 때만 압축
    concurrencyLimit: 10,    // 동시 압축 스트림 제한
    memLevel: 7              // 메모리 사용량 조절
  },
  
  // 쿠키 설정
  cookie: {
    name: 'io',
    httpOnly: true,
    sameSite: NODE_ENV === 'production' ? 'none' : 'lax', // 프로덕션에서 cross-site 허용
    secure: NODE_ENV === 'production', // 프로덕션에서만 HTTPS 필수
    maxAge: 24 * 60 * 60 * 1000 // 24시간
  }
});

// 추가: CORS preflight 요청 처리
app.options('*', cors(corsOptions));

let db;

async function initDb() {
  try {
    db = await open({
      filename: './database.db',
      driver: sqlite3.Database,
      // SQLite performance optimizations
      cached: true
    });

    // Enable foreign keys
    await db.run('PRAGMA foreign_keys = ON');
    
    // Performance optimizations
    await db.run('PRAGMA journal_mode = WAL');
    await db.run('PRAGMA synchronous = NORMAL');
    
    // Create tables
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE,
        password TEXT NOT NULL,
        phone TEXT,
        refresh_token TEXT,
        marketing_consent BOOLEAN DEFAULT 0,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS kanban_cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        ticker TEXT NOT NULL CHECK(length(ticker) <= 10),
        price REAL NOT NULL CHECK(price >= 0),
        quantity INTEGER NOT NULL CHECK(quantity > 0),
        column_id TEXT NOT NULL CHECK(column_id IN ('buy-wait', 'buy-done', 'sell-wait', 'sell-done')),
        total_value REAL GENERATED ALWAYS AS (price * quantity) STORED,
        notes TEXT CHECK(length(notes) <= 500),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS voice_commands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        command_text TEXT NOT NULL CHECK(length(command_text) <= 1000),
        intent_type TEXT,
        processed BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // Create indexes
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_kanban_user_created ON kanban_cards(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_voice_user_created ON voice_commands(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);

    // Create admin account only in development
    if (!isProduction && process.env.CREATE_TEST_ACCOUNT === 'true') {
      const testUser = await db.get('SELECT id FROM users WHERE username = ?', 'admin');
      if (!testUser) {
        const testPassword = process.env.TEST_PASSWORD;
        if (testPassword && testPassword.length >= 8) {
          const hashedPassword = await bcrypt.hash(testPassword, 12);
          await db.run(
            'INSERT INTO users (username, password, phone, email) VALUES (?, ?, ?, ?)',
            'admin', hashedPassword, '010-0000-0000', 'admin@test.com'
          );
          console.log('Development test account created');
        }
      }
    }

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    process.exit(1);
  }
}

initDb();

// Input validation helpers
const validateInput = {
  username: (username) => {
    return username && 
           /^[a-zA-Z0-9_]{3,20}$/.test(username);
  },
  password: (password) => {
    return password && 
           password.length >= 8 && 
           /[A-Z]/.test(password) && 
           /[a-z]/.test(password) && 
           /[0-9]/.test(password);
  },
  email: (email) => {
    return !email || validator.isEmail(email);
  },
  phone: (phone) => {
    return !phone || /^010-\d{4}-\d{4}$/.test(phone);
  },
  ticker: (ticker) => {
    return ticker && /^[A-Z0-9]{1,10}$/.test(ticker.toUpperCase());
  },
  price: (price) => {
    const num = parseFloat(price);
    return !isNaN(num) && num >= 0 && num <= 1000000;
  },
  quantity: (quantity) => {
    const num = parseInt(quantity);
    return !isNaN(num) && num > 0 && num <= 1000000;
  },
  columnId: (columnId) => {
    return ['buy-wait', 'buy-done', 'sell-wait', 'sell-done'].includes(columnId);
  }
};

// JWT token generation with refresh token
const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
  
  const refreshToken = jwt.sign(
    { id: user.id, username: user.username, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN }
  );
  
  return { accessToken, refreshToken };
};

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '인증이 필요합니다.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: '토큰이 만료되었습니다.', code: 'TOKEN_EXPIRED' });
      }
      return res.status(403).json({ error: '유효하지 않은 토큰입니다.' });
    }
    req.user = user;
    next();
  });
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err.message);
  
  // Don't leak error details in production
  if (isProduction) {
    if (err.message === 'Not allowed by CORS' || err.message.includes('CORS policy')) {
      return res.status(403).json({ error: '접근이 거부되었습니다.' });
    }
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
  
  // Development mode - show full error
  res.status(err.status || 500).json({ 
    error: err.message,
    stack: err.stack
  });
};

// Async error wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// REST API Routes

// Register with proper validation
app.post('/api/register', asyncHandler(async (req, res) => {
  const { username, password, phone, email, marketingConsent } = req.body;

  // Comprehensive validation
  if (!validateInput.username(username)) {
    return res.status(400).json({ 
      error: 'ID는 3-20자의 영문자, 숫자, 언더스코어만 사용 가능합니다.' 
    });
  }

  if (!validateInput.password(password)) {
    return res.status(400).json({ 
      error: '비밀번호는 8자 이상이며 대문자, 소문자, 숫자를 포함해야 합니다.' 
    });
  }

  if (phone && !validateInput.phone(phone)) {
    return res.status(400).json({ 
      error: '올바른 휴대폰 번호 형식이 아닙니다. (010-XXXX-XXXX)' 
    });
  }

  if (email && !validateInput.email(email)) {
    return res.status(400).json({ 
      error: '올바른 이메일 형식이 아닙니다.' 
    });
  }

  // Check existing user
  const existingUser = await db.get(
    'SELECT id FROM users WHERE username = ? OR email = ?', 
    username, email
  );
  
  if (existingUser) {
    return res.status(400).json({ error: '이미 존재하는 사용자입니다.' });
  }

  // Hash password with higher cost factor
  const hashedPassword = await bcrypt.hash(password, 12);
  
  const result = await db.run(
    `INSERT INTO users (username, password, phone, email, marketing_consent) 
     VALUES (?, ?, ?, ?, ?)`,
    username, hashedPassword, phone, email, marketingConsent ? 1 : 0
  );

  res.json({ success: true, userId: result.lastID });
}));

// Login with refresh token
app.post('/api/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  console.log('Login attempt:', username); // 추가

  if (!username || !password) {}
    console.log('Sending 400: Missing credentials'); // 추가
    return res.status(400).json({ error: 'ID와 비밀번호를 입력해주세요.' });
  }

  const user = await db.get(
    'SELECT id, username, password, email, phone, is_active FROM users WHERE username = ? OR email = ?',
    username, username
  );
  
  if (!user || !user.is_active) {
    console.log('Sending 401: Account not found'); // 추가
    return res.status(401).json({ error: '계정을 찾을 수 없습니다.' });
  }
  
  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    console.log('Sending 401: Invalid password'); // 추가
    return res.status(401).json({ error: 'ID 또는 비밀번호가 올바르지 않습니다.' });
  }

  const { accessToken, refreshToken } = generateTokens(user);
  
  // Save refresh token
  await db.run(
    'UPDATE users SET refresh_token = ? WHERE id = ?',
    refreshToken, user.id
  );

  res.json({
    success: true,
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      phone: user.phone
    }
  });
}));

// Refresh token endpoint
app.post('/api/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    return res.status(401).json({ error: '리프레시 토큰이 필요합니다.' });
  }
  
  jwt.verify(refreshToken, JWT_SECRET, async (err, decoded) => {
    if (err || decoded.type !== 'refresh') {
      return res.status(403).json({ error: '유효하지 않은 리프레시 토큰입니다.' });
    }
    
    const user = await db.get(
      'SELECT id, username, refresh_token FROM users WHERE id = ? AND refresh_token = ?',
      decoded.id, refreshToken
    );
    
    if (!user) {
      return res.status(403).json({ error: '토큰이 만료되었거나 유효하지 않습니다.' });
    }
    
    const tokens = generateTokens(user);
    
    await db.run(
      'UPDATE users SET refresh_token = ? WHERE id = ?',
      tokens.refreshToken, user.id
    );
    
    res.json(tokens);
  });
}));

// Logout
app.post('/api/logout', authenticateToken, asyncHandler(async (req, res) => {
  await db.run(
    'UPDATE users SET refresh_token = NULL WHERE id = ?',
    req.user.id
  );
  res.json({ success: true });
}));

// Get profile (optimized query)
app.get('/api/profile', authenticateToken, asyncHandler(async (req, res) => {
  const user = await db.get(
    'SELECT id, username, email, phone, created_at FROM users WHERE id = ?',
    req.user.id
  );
  
  if (!user) {
    return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  }
  
  res.json(user);
}));

// Kanban CRUD with validation
app.get('/api/kanban', authenticateToken, asyncHandler(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;
  
  const cards = await db.all(
    `SELECT id, ticker, price, quantity, column_id, notes, created_at, updated_at, total_value 
     FROM kanban_cards 
     WHERE user_id = ? 
     ORDER BY created_at DESC 
     LIMIT ? OFFSET ?`,
    req.user.id, limit, offset
  );
  
  const total = await db.get(
    'SELECT COUNT(*) as count FROM kanban_cards WHERE user_id = ?',
    req.user.id
  );
  
  res.json({
    cards: cards || [],
    total: total.count,
    page: parseInt(page),
    limit: parseInt(limit)
  });
}));

app.post('/api/kanban', authenticateToken, asyncHandler(async (req, res) => {
  const { ticker, price, quantity, column_id, notes } = req.body;
  
  // Strict validation
  if (!validateInput.ticker(ticker)) {
    return res.status(400).json({ error: '유효하지 않은 종목 코드입니다.' });
  }
  
  if (!validateInput.price(price)) {
    return res.status(400).json({ error: '유효하지 않은 가격입니다.' });
  }
  
  if (!validateInput.quantity(quantity)) {
    return res.status(400).json({ error: '유효하지 않은 수량입니다.' });
  }
  
  if (!validateInput.columnId(column_id)) {
    return res.status(400).json({ error: '유효하지 않은 상태입니다.' });
  }
  
  if (notes && notes.length > 500) {
    return res.status(400).json({ error: '메모는 500자 이내로 작성해주세요.' });
  }
  
  const result = await db.run(
    `INSERT INTO kanban_cards (user_id, ticker, price, quantity, column_id, notes) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    req.user.id, ticker.toUpperCase(), price, quantity, column_id, notes || ''
  );
  
  const card = await db.get(
    `SELECT id, ticker, price, quantity, column_id, notes, created_at, total_value 
     FROM kanban_cards WHERE id = ?`,
    result.lastID
  );
  
  res.json(card);
}));

// WebSocket handling with rate limiting
const voiceCommandLimiter = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    return next(new Error('Authentication required'));
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return next(new Error('Invalid token'));
    }
    socket.userId = decoded.id;
    socket.username = decoded.username;
    next();
  });
});

// Socket.IO 연결 로깅 개선
io.on('connection', (socket) => {
  const clientIP = socket.handshake.address;
  const userAgent = socket.handshake.headers['user-agent'];
  const origin = socket.handshake.headers.origin;
  
  console.log(`🔌 New Socket.IO connection:`, {
    id: socket.id,
    user: socket.username,
    ip: clientIP,
    origin: origin,
    transport: socket.conn.transport.name,
    userAgent: userAgent?.substring(0, 100) + '...'
  });
  
  // 전송 방식 변경 감지
  socket.conn.on('upgrade', () => {
    console.log(`🚀 Socket ${socket.id} upgraded to: ${socket.conn.transport.name}`);
  });

  socket.emit('connected', { 
    message: '연결되었습니다.',
    userId: socket.userId 
  });

  // Voice command with rate limiting
  socket.on('voice-command', async (data) => {
    const { text } = data;
    
    // Rate limiting check
    const now = Date.now();
    const userLimiter = voiceCommandLimiter.get(socket.userId) || { count: 0, resetTime: now + 60000 };
    
    if (now > userLimiter.resetTime) {
      userLimiter.count = 0;
      userLimiter.resetTime = now + 60000;
    }
    
    if (userLimiter.count >= 10) {
      return socket.emit('error', { 
        message: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.',
        code: 'RATE_LIMIT'
      });
    }
    
    userLimiter.count++;
    voiceCommandLimiter.set(socket.userId, userLimiter);
    
    // Validate input
    if (!text || text.length > 1000) {
      return socket.emit('error', { 
        message: '유효하지 않은 명령입니다.' 
      });
    }
    
    console.log(`Voice command from ${socket.username}: ${text}`);

    try {
      // Save to database
      await db.run(
        'INSERT INTO voice_commands (user_id, command_text) VALUES (?, ?)',
        socket.userId, text
      );

      // Process with n8n if configured
      if (N8N_WEBHOOK_URL) {
        try {
          await axios.post(N8N_WEBHOOK_URL, {
            text,
            userId: socket.userId,
            username: socket.username,
            socketId: socket.id,
            timestamp: new Date().toISOString()
          }, {
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' }
          });

          socket.emit('processing', { 
            status: 'analyzing', 
            message: '명령을 처리하고 있습니다...' 
          });
        } catch (error) {
          console.error('n8n webhook error:', error.message);
          // Provide meaningful fallback
          socket.emit('command-result', {
            type: 'fallback',
            data: {
              message: '명령을 처리할 수 없습니다. 다시 시도해주세요.',
              originalText: text
            },
            timestamp: new Date().toISOString()
          });
        }
      } else {
        // No n8n configured
        socket.emit('command-result', {
          type: 'error',
          data: {
            message: '음성 처리 서비스가 설정되지 않았습니다.',
            originalText: text
          },
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Voice command error:', error);
      socket.emit('error', { 
        message: '명령 처리 중 오류가 발생했습니다.' 
      });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`❌ Socket ${socket.id} (${socket.username}) disconnected:`, reason);
  });
});

// Socket.IO 에러 핸들링
io.engine.on("connection_error", (err) => {
  console.error("Socket.IO connection error:", {
    code: err.code,
    message: err.message,
    context: err.context,
    type: err.type
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    version: process.env.APP_VERSION || '1.0.0'
  });
});

// Serve static files in production
if (isProduction) {
  app.use(express.static(path.join(__dirname, '../frontend/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
  });
}

// Error handling middleware (must be last)
app.use(errorHandler);

// 프로세스 종료 시 Socket.IO 정리
process.on('SIGTERM', () => {
  console.log('🔄 SIGTERM received, closing Socket.IO server...');
  io.close(() => {
    console.log('✅ Socket.IO server closed');
    if (db) {
      db.close(() => {
        console.log('✅ Database closed');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });
});

process.on('SIGINT', () => {
  console.log('🔄 SIGINT received, closing Socket.IO server...');
  io.close(() => {
    console.log('✅ Socket.IO server closed');
    if (db) {
      db.close(() => {
        console.log('✅ Database closed');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} in ${NODE_ENV} mode`);
  console.log(`Allowed domains: ${ALLOWED_DOMAINS.join(', ')}`);
});