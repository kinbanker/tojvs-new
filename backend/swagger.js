// backend/swagger.js
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Tojvs API',
      version: '1.0.0',
      description: 'AI Trading Assistant API Documentation',
    },
    servers: [
      {
        url: process.env.NODE_ENV === 'production' 
          ? 'https://tojvs.com/api'
          : 'http://localhost:3001/api',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./server.js'], // API 주석이 있는 파일 경로
};

module.exports = swaggerJsdoc(options);