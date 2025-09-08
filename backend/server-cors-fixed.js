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
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Environment variables with defaults
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-key';
const NODE_ENV = process.env.NODE_ENV || 'development';
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.sprint.kr/webhook/tojvs-voice';

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.'
});
app.use('/api/', limiter);

// CORS configuration - FIXED for production
const corsOptions = {
  origin: function (origin, callback) {
    // Production에서 실제 도메인 추가
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://43.201.62.36',  // 서버 IP
      'http://43.201.62.36:3000',
      'http://43.201.62.36:3001',
      'https://tojvs.com',
      'https://www.tojvs.com',
      'http://tojvs.com',
      'http://www.tojvs.com'
    ];
    
    // origin이 없는 경우 (같은 도메인 요청) 허용
    if (!origin) {
      return callback(null, true);
    }
    
    // 개발 환경에서는 모든 origin 허용
    if (NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    // 프로덕션에서는 허용된 origin만
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(null, true); // 일단 허용 (테스트를 위해)
      // callback(new Error('CORS policy violation'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Socket.io setup with better error handling
const io = socketIO(server, {
  cors: {
    origin: function(origin, callback) {
      // Socket.IO에서도 동일한 CORS 정책 적용
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://43.201.62.36',
        'http://43.201.62.36:3000',
        'http://43.201.62.36:3001',
        'https://tojvs.com',
        'https://www.tojvs.com'
      ];
      
      if (!origin || NODE_ENV === 'development' || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        console.log('Socket.IO CORS blocked:', origin);
        callback(null, true); // 일단 허용
      }
    },
    credentials: true,
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'] // 폴링 추가
});

// Database setup
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

let db;

async function initDb() {
  try {
    db = await open({
      filename: './database.db',
      driver: sqlite3.Database
    });

    // Create tables
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        phone TEXT,
        marketing_consent BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS kanban_cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        ticker TEXT NOT NULL,
        price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        column_id TEXT NOT NULL,
        total_value REAL GENERATED ALWAYS AS (price * quantity) STORED,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS voice_commands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        command_text TEXT NOT NULL,
        intent_type TEXT,
        processed BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // Create indexes
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_kanban_user ON kanban_cards(user_id);
      CREATE INDEX IF NOT EXISTS idx_voice_user ON voice_commands(user_id);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `);

    // Create test account if not exists
    const testUser = await db.get('SELECT * FROM users WHERE username = ?', 'admin');
    if (!testUser) {
      const testPassword = process.env.TEST_PASSWORD || 'xptmxm';
      const hashedTestPassword = await bcrypt.hash(testPassword, 10);
      await db.run(
        'INSERT INTO users (username, password, phone) VALUES (?, ?, ?)',
        'admin', hashedTestPassword, '010-0000-0000'
      );
      console.log('Test account created: admin/' + testPassword);
    }

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    process.exit(1);
  }
}

initDb();

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '인증이 필요합니다.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('JWT verification error:', err.message);
      return res.status(403).json({ error: '유효하지 않은 토큰입니다.' });
    }
    req.user = user;
    next();
  });
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);
  
  if (err.message === 'CORS policy violation') {
    return res.status(403).json({ error: 'CORS 정책 위반' });
  }
  
  res.status(500).json({ 
    error: NODE_ENV === 'production' 
      ? '서버 오류가 발생했습니다.' 
      : err.message 
  });
};

// Async error wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// REST API Routes

// Register
app.post('/api/register', asyncHandler(async (req, res) => {
  const { username, password, phone, marketingConsent } = req.body;

  if (!username || !password || !phone) {
    return res.status(400).json({ error: '모든 필수 항목을 입력해주세요.' });
  }

  const existingUser = await db.get('SELECT * FROM users WHERE username = ?', username);
  if (existingUser) {
    return res.status(400).json({ error: '이미 존재하는 ID입니다.' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const result = await db.run(
    'INSERT INTO users (username, password, phone, marketing_consent) VALUES (?, ?, ?, ?)',
    username, hashedPassword, phone, marketingConsent ? 1 : 0
  );

  res.json({ success: true, userId: result.lastID });
}));

// Login
app.post('/api/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'ID와 비밀번호를 입력해주세요.' });
  }

  const user = await db.get('SELECT * FROM users WHERE username = ?', username);
  
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'ID 또는 비밀번호가 올바르지 않습니다.' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      phone: user.phone
    }
  });
}));

// Get profile
app.get('/api/profile', authenticateToken, asyncHandler(async (req, res) => {
  const user = await db.get(
    'SELECT id, username, phone, created_at FROM users WHERE id = ?',
    req.user.id
  );
  res.json(user);
}));

// Kanban CRUD
app.get('/api/kanban', authenticateToken, asyncHandler(async (req, res) => {
  const cards = await db.all(
    'SELECT * FROM kanban_cards WHERE user_id = ? ORDER BY created_at DESC',
    req.user.id
  );
  res.json(cards || []);
}));

app.post('/api/kanban', authenticateToken, asyncHandler(async (req, res) => {
  const { ticker, price, quantity, column_id, notes } = req.body;
  
  if (!ticker || !price || !quantity || !column_id) {
    return res.status(400).json({ error: '필수 정보를 입력해주세요.' });
  }
  
  const result = await db.run(
    'INSERT INTO kanban_cards (user_id, ticker, price, quantity, column_id, notes) VALUES (?, ?, ?, ?, ?, ?)',
    req.user.id, ticker, price, quantity, column_id, notes || ''
  );
  
  const card = await db.get('SELECT * FROM kanban_cards WHERE id = ?', result.lastID);
  res.json(card);
}));

app.put('/api/kanban/:id', authenticateToken, asyncHandler(async (req, res) => {
  const { column_id } = req.body;
  const { id } = req.params;
  
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

// WebSocket handling
const activeConnections = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  
  console.log('Socket auth attempt:', { hasToken: !!token });
  
  if (!token) {
    return next(new Error('Authentication error'));
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error('Socket JWT error:', err.message);
      return next(new Error('Authentication error'));
    }
    socket.userId = decoded.id;
    socket.username = decoded.username;
    next();
  });
});

io.on('connection', (socket) => {
  console.log(`User ${socket.username} connected (${socket.id})`);
  activeConnections.set(socket.id, {
    userId: socket.userId,
    username: socket.username,
    connectedAt: new Date()
  });

  socket.emit('connected', { 
    message: '연결되었습니다.',
    userId: socket.userId 
  });

  // Handle voice command
  socket.on('voice-command', async (data) => {
    const { text } = data;
    console.log(`Voice command from ${socket.username}: ${text}`);

    try {
      // Save to database
      await db.run(
        'INSERT INTO voice_commands (user_id, command_text) VALUES (?, ?)',
        socket.userId, text
      );

      // Send to n8n
      try {
        const token = socket.handshake.auth.token;
        const n8nResponse = await axios.post(N8N_WEBHOOK_URL, {
          text,
          userId: socket.userId,
          username: socket.username,
          socketId: socket.id,
          token: token,
          timestamp: new Date().toISOString()
        }, {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json'
          }
        });

        socket.emit('processing', { 
          status: 'analyzing', 
          message: '명령을 처리하고 있습니다...' 
        });

      } catch (error) {
        console.error('n8n webhook error:', error.message);
        
        // Fallback local processing
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
            
            socket.emit('command-result', {
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
    } catch (error) {
      console.error('Voice command error:', error);
      socket.emit('error', { message: '명령 처리 중 오류가 발생했습니다.' });
    }
  });

  // Handle card movement
  socket.on('move-card', async (data) => {
    const { cardId, fromColumn, toColumn } = data;
    
    try {
      await db.run(
        'UPDATE kanban_cards SET column_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
        toColumn, cardId, socket.userId
      );

      io.emit('kanban-update', {
        type: 'MOVE',
        cardId,
        fromColumn,
        toColumn,
        userId: socket.userId
      });
    } catch (error) {
      console.error('Move card error:', error);
      socket.emit('error', { message: '카드 이동 중 오류가 발생했습니다.' });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`User ${socket.username} disconnected (${reason})`);
    activeConnections.delete(socket.id);
  });
});

// n8n webhook result endpoint
app.post('/webhook/n8n-result', asyncHandler(async (req, res) => {
  const { socketId, type, data } = req.body;
  
  console.log('Received from n8n:', { socketId, type });
  
  const socket = io.sockets.sockets.get(socketId);
  if (socket) {
    if (type === 'kanban' && data.action === 'ADD_CARD' && data.card) {
      try {
        const result = await db.run(
          'INSERT INTO kanban_cards (user_id, ticker, price, quantity, column_id) VALUES (?, ?, ?, ?, ?)',
          socket.userId, 
          data.card.ticker || 'UNKNOWN', 
          data.card.price || 0, 
          data.card.quantity || 100, 
          data.card.column || 'buy-wait'
        );
        data.card.id = result.lastID;
        
        await db.run(
          'UPDATE voice_commands SET processed = 1, intent_type = ? WHERE user_id = ? AND processed = 0 ORDER BY created_at DESC LIMIT 1',
          'KANBAN_ADD', socket.userId
        );
      } catch (err) {
        console.error('Database error:', err);
      }
    }

    socket.emit('command-result', {
      type,
      data,
      timestamp: new Date().toISOString()
    });
  } else {
    console.error('Socket not found for ID:', socketId);
  }
  
  res.json({ success: true });
}));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    connections: activeConnections.size,
    environment: NODE_ENV,
    n8nWebhook: N8N_WEBHOOK_URL
  });
});

// Mock stock endpoint
app.get('/api/stocks/:ticker', authenticateToken, asyncHandler(async (req, res) => {
  const { ticker } = req.params;
  
  const mockData = {
    ticker: ticker.toUpperCase(),
    price: (Math.random() * 100 + 10).toFixed(2),
    change: (Math.random() * 10 - 5).toFixed(2),
    changePercent: (Math.random() * 5 - 2.5).toFixed(2),
    volume: Math.floor(Math.random() * 1000000),
    timestamp: new Date().toISOString()
  };
  
  res.json(mockData);
}));

// Serve static files in production
if (NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
  });
}

// Error handling middleware
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    db.close(() => {
      console.log('Database connection closed');
      process.exit(0);
    });
  });
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
  WebSocket: Enabled
  n8n Webhook: ${N8N_WEBHOOK_URL}
  ========================================
  `);
});