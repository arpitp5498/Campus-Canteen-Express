/**
 * Campus Canteen Express - Express Application Definition
 * File: backend/app.js
 */

const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const config = require('./config');
const apiRoutes = require('./routes');
const { errorHandler, NotFoundError } = require('./middleware/errorHandler');
const { errorResponse } = require('./utils/response');

const app = express();

// 1. Security HTTP Headers (Helmet)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

// 2. CORS
app.use(
  cors({
    origin: config.corsOrigin || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  })
);

// 3. Request Body Parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 4. Static Frontend File Serving
const frontendDir = path.join(__dirname, '../frontend');
const imagesDir = path.join(frontendDir, 'images');

if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
}
if (fs.existsSync(imagesDir)) {
  app.use('/images', express.static(imagesDir));
}

// 5. Mount API Routes under /api
app.use('/api', apiRoutes);

// 6. Catch-All 404 Route Handler
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api')) {
    return errorResponse(res, `API route not found: ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND');
  }

  // SPA fallback for HTML requests if frontend/index.html exists
  const indexPath = path.join(frontendDir, 'index.html');
  if (fs.existsSync(indexPath) && req.accepts('html')) {
    return res.sendFile(indexPath);
  }

  return errorResponse(res, `Resource not found: ${req.originalUrl}`, 404, 'NOT_FOUND');
});

// 7. Global Centralized Error Handler
app.use(errorHandler);

module.exports = app;
module.exports.app = app;
