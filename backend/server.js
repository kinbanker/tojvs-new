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
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
let io; // Socket.IO 인스턴스를 위한 전역 변수

// Environment validation
const requiredEnvVars = ['JWT_SECRET', 'NODE_ENV'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

// Environment variables
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const NODE_ENV = process.env.NODE_ENV;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || '';
const ALLOWED_DOMAINS = process.env.ALLOWED_DOMAINS ? 
  process.env.ALLOWED_DOMAINS.split(',').map(d => d.trim()) : 
  ['tojvs.com', 'www.tojvs.com', 'dev.tojvs.com'];

// Production check
const isProduction = NODE_ENV === 'production';

// 🔥 개선된 사용자-소켓 매핑 관리
// userId를 기준으로 모든 소켓 연결을 추적
const userSocketMap = new Map(); // userId -> Set of socket IDs
const socketUserMap = new Map(); // socketId -> { userId, username }
const pendingCommands = new Map(); // commandId -> { userId, username, timestamp }

// Allowed origins configuration
const getAllowedOrigins = () => {
  const origins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://localhost:8080',
    'http://localhost:8000',
    'http://0.0.0.0:3000'
  ];
  
  // Add custom domains from environment
  if (ALLOWED_DOMAINS && ALLOWED_DOMAINS.length > 0) {
    ALLOWED_DOMAINS.forEach(domain => {
      origins.push(`http://${domain}`);
      origins.push(`https://${domain}`);
      
      if (!domain.startsWith('www.')) {
        origins.push(`http://www.${domain}`);
        origins.push(`https://www.${domain}`);
      }
      
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
  
  const uniqueOrigins = [...new Set(origins)];
  console.log('📍 Allowed Origins:', uniqueOrigins);
  return uniqueOrigins;
};

// Security middleware
app.use(helmet({
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", ...getAllowedOrigins()],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: isProduction ? [] : null
    }
  } : false,
  crossOriginEmbedderPolicy: false
}));

// Rate limiting
const createRateLimiter = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message,
  skip: (req) => !isProduction
});

const apiLimiter = createRateLimiter(15 * 60 * 1000, 100, '너무 많은 요청입니다.');
const authLimiter = createRateLimiter(15 * 60 * 1000, 5, '너무 많은 인증 시도입니다.');
const voiceLimiter = createRateLimiter(60 * 1000, 10, '음성 명령 한도를 초과했습니다.');

app.use('/api/', apiLimiter);
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

// CORS configuration
const corsOptions = {
  origin: function(origin, callback) {
    const allowedOrigins = getAllowedOrigins();
    
    if (!origin && NODE_ENV === 'development') {
      console.log('✅ CORS: Allowing request without origin (development)');
      return callback(null, true);
    }
    
    if (!origin) {
      console.log('✅ CORS: Allowing same-origin request');
      return callback(null, true);
    }
    
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
  maxAge: 86400,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Socket.io setup
io = socketIO(server, {
  cors: {
    origin: function(origin, callback) {
      const allowedOrigins = getAllowedOrigins();
      
      console.log(`🔌 Socket.IO connection attempt from: ${origin || 'same-origin'}`);
      
      if (!origin || NODE_ENV === 'development') {
        console.log('✅ Socket.IO: Allowing connection (development or same-origin)');
        return callback(null, true);
      }
      
      if (allowedOrigins.includes(origin)) {
        console.log(`✅ Socket.IO: Allowing origin: ${origin}`);
        callback(null, true);
      } else {
        console.warn(`❌ Socket.IO: Blocking origin: ${origin}`);
        console.warn(`📋 Socket.IO allowed origins:`, allowedOrigins);
        callback(null, false);
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
  
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  
  transports: ['polling', 'websocket'],
  allowUpgrades: true,
  upgradeTimeout: 10000,
  
  allowEIO3: true,
  maxHttpBufferSize: 1e6,
  
  path: '/socket.io/',
  
  serveClient: false,
  
  compression: true,
  perMessageDeflate: {
    threshold: 1024,
    concurrencyLimit: 10,
    memLevel: 7
  },
  
  cookie: {
    name: 'io',
    httpOnly: true,
    sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
    secure: NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  }
});

// CORS preflight
app.options('*', cors(corsOptions));

let db;

async function initDb() {
  try {
    db = await open({
      filename: './database.db',
      driver: sqlite3.Database,
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

    // 🔥 voice_commands 테이블에 command_id 추가
    await db.exec(`
      CREATE TABLE IF NOT EXISTS voice_commands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        command_id TEXT UNIQUE NOT NULL,
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
      CREATE INDEX IF NOT EXISTS idx_voice_command_id ON voice_commands(command_id);
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
  
  if (isProduction) {
    if (err.message === 'Not allowed by CORS' || err.message.includes('CORS policy')) {
      return res.status(403).json({ error: '접근이 거부되었습니다.' });
    }
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
  
  res.status(err.status || 500).json({ 
    error: err.message,
    stack: err.stack
  });
};

// Async error wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// 🔥 Helper function to emit to all user's sockets
function emitToUser(userId, event, data) {
  const userSockets = userSocketMap.get(userId);
  if (userSockets && userSockets.size > 0) {
    userSockets.forEach(socketId => {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit(event, data);
        console.log(`Emitted ${event} to socket ${socketId} for user ${userId}`);
      }
    });
    return true;
  }
  console.log(`No active sockets found for user ${userId}`);
  return false;
}

// REST API Routes

// Register
app.post('/api/register', asyncHandler(async (req, res) => {
  const { username, password, phone, email, marketingConsent } = req.body;

  // Validation
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

  const hashedPassword = await bcrypt.hash(password, 12);
  
  const result = await db.run(
    `INSERT INTO users (username, password, phone, email, marketing_consent) 
     VALUES (?, ?, ?, ?, ?)`,
    username, hashedPassword, phone, email, marketingConsent ? 1 : 0
  );

  res.json({ success: true, userId: result.lastID });
}));

// Login
app.post('/api/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  console.log('Login attempt:', username);

  if (!username || !password) {
    console.log('Sending 400: Missing credentials');
    return res.status(400).json({ error: 'ID와 비밀번호를 입력해주세요.' });
  }

  const user = await db.get(
    'SELECT id, username, password, email, phone, is_active FROM users WHERE username = ? OR email = ?',
    username, username
  );
  
  if (!user || !user.is_active) {
    console.log('Sending 401: Account not found');
    return res.status(401).json({ error: '계정을 찾을 수 없습니다.' });
  }
  
  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    console.log('Sending 401: Invalid password');
    return res.status(401).json({ error: 'ID 또는 비밀번호가 올바르지 않습니다.' });
  }

  const { accessToken, refreshToken } = generateTokens(user);
  
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

// Get profile
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

// Kanban CRUD
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

app.put('/api/kanban/:id', authenticateToken, asyncHandler(async (req, res) => {
  const { column_id } = req.body;
  const { id } = req.params;
  
  if (!validateInput.columnId(column_id)) {
    return res.status(400).json({ error: '유효하지 않은 상태입니다.' });
  }
  
  await db.run(
    'UPDATE kanban_cards SET column_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
    column_id, id, req.user.id
  );
  
  res.json({ success: true });
}));

app.delete('/api/kanban/:id', authenticateToken, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  await db.run(
    'DELETE FROM kanban_cards WHERE id = ? AND user_id = ?',
    id, req.user.id
  );
  
  res.json({ success: true });
}));

// WebSocket handling with improved user tracking
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

io.on('connection', (socket) => {
  const userId = socket.userId;
  const username = socket.username;
  const clientIP = socket.handshake.address;
  const userAgent = socket.handshake.headers['user-agent'];
  const origin = socket.handshake.headers.origin;
  
  console.log(`🔌 New Socket.IO connection:`, {
    id: socket.id,
    userId: userId,
    user: username,
    ip: clientIP,
    origin: origin,
    transport: socket.conn.transport.name,
    userAgent: userAgent?.substring(0, 100) + '...'
  });
  
  // 🔥 Update user-socket mappings
  if (!userSocketMap.has(userId)) {
    userSocketMap.set(userId, new Set());
  }
  userSocketMap.get(userId).add(socket.id);
  socketUserMap.set(socket.id, { userId, username });
  
  // Transport upgrade detection
  socket.conn.on('upgrade', () => {
    console.log(`🚀 Socket ${socket.id} upgraded to: ${socket.conn.transport.name}`);
  });

  socket.emit('connected', { 
    message: '연결되었습니다.',
    userId: userId,
    socketId: socket.id
  });

  // Voice command with improved tracking
  socket.on('voice-command', async (data) => {
    const { text } = data;
    
    // Rate limiting
    const now = Date.now();
    const userLimiter = voiceCommandLimiter.get(userId) || { count: 0, resetTime: now + 60000 };
    
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
    voiceCommandLimiter.set(userId, userLimiter);
    
    // Validate input
    if (!text || text.length > 1000) {
      return socket.emit('error', { 
        message: '유효하지 않은 명령입니다.' 
      });
    }
    
    console.log(`Voice command from ${username} (User ID: ${userId}): ${text}`);

    try {
      // 🔥 Generate unique command ID
      const commandId = `cmd_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Save to database with command ID
      await db.run(
        'INSERT INTO voice_commands (command_id, user_id, command_text) VALUES (?, ?, ?)',
        commandId, userId, text
      );

      // 🔥 Store pending command
      pendingCommands.set(commandId, {
        userId,
        username,
        timestamp: new Date().toISOString()
      });

      // Process with n8n if configured
      if (N8N_WEBHOOK_URL) {
        try {
          await axios.post(N8N_WEBHOOK_URL, {
            text,
            commandId,  // 🔥 Use commandId instead of socketId
            userId,
            username,
            socketId: socket.id, // Still send socketId as fallback
            timestamp: new Date().toISOString()
          }, {
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' }
          });

          // Send processing status to all user's sockets
          emitToUser(userId, 'processing', { 
            status: 'analyzing', 
            message: '명령을 처리하고 있습니다...',
            commandId
          });

          // Clean up old pending commands (older than 5 minutes)
          const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
          for (const [cmdId, cmdData] of pendingCommands.entries()) {
            if (new Date(cmdData.timestamp).getTime() < fiveMinutesAgo) {
              pendingCommands.delete(cmdId);
            }
          }

        } catch (error) {
          console.error('n8n webhook error:', error.message);
          
          // Fallback: Process locally for basic commands
          const lowerText = text.toLowerCase();
          
          if (lowerText.includes('매수') || lowerText.includes('매도')) {
            const tickerMatch = text.match(/([A-Z]+)/);
            const priceMatch = text.match(/(\d+\.?\d*)/);
            const quantityMatch = text.match(/(\d+)주/);
            
            if (tickerMatch && priceMatch) {
              const card = {
                ticker: tickerMatch[1],
                price: parseFloat(priceMatch[1]),
                quantity: quantityMatch ? parseInt(quantityMatch[1]) : 100,
                column: lowerText.includes('매수') ? 'buy-wait' : 'sell-wait'
              };
              
              emitToUser(userId, 'command-result', {
                type: 'kanban',
                data: {
                  action: 'ADD_CARD',
                  card
                },
                timestamp: new Date().toISOString()
              });
            }
          } else {
            socket.emit('error', { 
              message: 'n8n 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.' 
            });
          }
        }
      } else {
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

  // Handle kanban card movement
  socket.on('move-card', async (data) => {
    const { cardId, fromColumn, toColumn } = data;
    
    try {
      await db.run(
        'UPDATE kanban_cards SET column_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
        toColumn, cardId, userId
      );

      // Broadcast to all user's connections
      emitToUser(userId, 'kanban-update', {
        type: 'MOVE',
        cardId,
        fromColumn,
        toColumn,
        userId
      });
    } catch (error) {
      console.error('Move card error:', error);
      socket.emit('error', { message: '카드 이동 중 오류가 발생했습니다.' });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`❌ Socket ${socket.id} (${username}) disconnected:`, reason);
    
    // 🔥 Update user-socket mappings
    const userSockets = userSocketMap.get(userId);
    if (userSockets) {
      userSockets.delete(socket.id);
      if (userSockets.size === 0) {
        userSocketMap.delete(userId);
        console.log(`User ${username} (ID: ${userId}) has no more active connections`);
      }
    }
    socketUserMap.delete(socket.id);
  });
});

// Socket.IO error handling
io.engine.on("connection_error", (err) => {
  console.error("Socket.IO connection error:", {
    code: err.code,
    message: err.message,
    context: err.context,
    type: err.type
  });
});

// 🔥 Improved n8n webhook endpoint
app.post('/webhook/n8n-result', asyncHandler(async (req, res) => {
  const { commandId, socketId, userId: requestUserId, type, data } = req.body;
  
  console.log('[n8n Webhook] Received:', {
    commandId,
    socketId,
    requestUserId,
    type,
    timestamp: new Date().toISOString()
  });
  
  let targetUserId = null;
  
  // 🔥 Try multiple methods to identify the user
  if (commandId && pendingCommands.has(commandId)) {
    // Method 1: Use commandId to find user (most reliable)
    const commandData = pendingCommands.get(commandId);
    targetUserId = commandData.userId;
    console.log(`[n8n Webhook] Found user ${targetUserId} via commandId ${commandId}`);
    pendingCommands.delete(commandId);
  } else if (socketId && socketUserMap.has(socketId)) {
    // Method 2: Try socketId (might be stale)
    const socketData = socketUserMap.get(socketId);
    targetUserId = socketData.userId;
    console.log(`[n8n Webhook] Found user ${targetUserId} via socketId ${socketId}`);
  } else if (requestUserId) {
    // Method 3: Use userId from request
    targetUserId = requestUserId;
    console.log(`[n8n Webhook] Using userId ${targetUserId} from request`);
  }
  
  if (!targetUserId) {
    console.error('[n8n Webhook] Could not identify target user');
    return res.status(400).json({ 
      success: false, 
      error: 'User identification failed',
      receivedData: { commandId, socketId, requestUserId }
    });
  }
  
  // Handle different result types
  if (type === 'kanban' && data.action === 'ADD_CARD') {
    try {
      // Save to database
      const result = await db.run(
        'INSERT INTO kanban_cards (user_id, ticker, price, quantity, column_id) VALUES (?, ?, ?, ?, ?)',
        targetUserId, data.card.ticker, data.card.price, data.card.quantity, data.card.column
      );
      
      data.card.id = result.lastID;
      
      // Update voice command as processed
      if (commandId) {
        await db.run(
          'UPDATE voice_commands SET processed = 1, intent_type = ? WHERE command_id = ?',
          'ADD_TRADE', commandId
        );
      }
      
      // 🔥 Send to all user's active sockets
      const sent = emitToUser(targetUserId, 'command-result', {
        type,
        data,
        timestamp: new Date().toISOString()
      });
      
      // Also try the legacy event name for backward compatibility
      emitToUser(targetUserId, 'voiceCommandResult', {
        type,
        data,
        timestamp: new Date().toISOString(),
        source: 'n8n'
      });
      
      if (!sent) {
        console.log(`[n8n Webhook] User ${targetUserId} has no active connections, storing for later`);
        // TODO: Consider storing in database for later retrieval
      }
      
    } catch (error) {
      console.error('[n8n Webhook] Error processing kanban result:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Database error',
        details: error.message
      });
    }
  } else {
    // Generic result handling
    emitToUser(targetUserId, 'command-result', {
      type,
      data,
      timestamp: new Date().toISOString()
    });
    
    // Also emit with legacy event name
    emitToUser(targetUserId, 'voiceCommandResult', {
      type,
      data,
      timestamp: new Date().toISOString(),
      source: 'n8n'
    });
  }
  
  res.json({ 
    success: true,
    userId: targetUserId,
    delivered: userSocketMap.has(targetUserId),
    activeSockets: userSocketMap.get(targetUserId)?.size || 0
  });
}));

// 🔥 New endpoint to check user's socket status
app.get('/api/socket-status/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const userIdNum = parseInt(userId);
  const userSockets = userSocketMap.get(userIdNum);
  
  res.json({
    userId: userIdNum,
    connected: userSockets && userSockets.size > 0,
    socketCount: userSockets ? userSockets.size : 0,
    socketIds: userSockets ? Array.from(userSockets) : [],
    pendingCommands: Array.from(pendingCommands.entries())
      .filter(([_, data]) => data.userId === userIdNum)
      .map(([cmdId, data]) => ({ commandId: cmdId, timestamp: data.timestamp }))
  });
}));

// Health check with enhanced details
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    connections: {
      total: io.sockets.sockets.size,
      users: userSocketMap.size,
      sockets: socketUserMap.size,
      userDetails: Array.from(userSocketMap.entries()).map(([userId, sockets]) => ({
        userId,
        socketCount: sockets.size
      }))
    },
    pendingCommands: pendingCommands.size,
    environment: NODE_ENV,
    n8nWebhook: N8N_WEBHOOK_URL ? 'configured' : 'not configured',
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

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔄 SIGTERM received, shutting down gracefully...');
  
  server.close(() => {
    console.log('✅ HTTP server closed');
    
    io.close(() => {
      console.log('✅ Socket.IO server closed');
      
      if (db) {
        db.close()
          .then(() => {
            console.log('✅ Database closed');
            process.exit(0);
          })
          .catch(err => {
            console.error('❌ Database close error:', err);
            process.exit(1);
          });
      } else {
        process.exit(0);
      }
    });
  });
  
  setTimeout(() => {
    console.error('❌ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
});

process.on('SIGINT', () => {
  console.log('🔄 SIGINT received, shutting down gracefully...');
  
  server.close(() => {
    console.log('✅ HTTP server closed');
    
    io.close(() => {
      console.log('✅ Socket.IO server closed');
      
      if (db) {
        db.close()
          .then(() => {
            console.log('✅ Database closed');
            process.exit(0);
          })
          .catch(err => {
            console.error('❌ Database close error:', err);
            process.exit(1);
          });
      } else {
        process.exit(0);
      }
    });
  });
  
  setTimeout(() => {
    console.error('❌ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
});

// PM2 ready signal
process.on('ready', () => {
  if (process.send) {
    process.send('ready');
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`
  ========================================
  🚀 tojvs Backend Server Started
  ========================================
  Environment: ${NODE_ENV}
  Port: ${PORT}
  Database: SQLite
  WebSocket: Enabled (with Command ID tracking)
  n8n Webhook: ${N8N_WEBHOOK_URL || 'Not configured'}
  Allowed Domains: ${ALLOWED_DOMAINS.join(', ')}
  ========================================
  `);
  
  // PM2 ready signal
  if (process.send) {
    process.send('ready');
  }
});