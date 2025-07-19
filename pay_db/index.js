const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const mainRoutes = require('./routes/index');
const paymentRoutes = require('./routes/payment');
const subscriptionRoutes = require('./routes/subscription');
const { errorHandler } = require('./middleware/errorHandler');
const { sanitizeInput } = require('./middleware/validation');
const { logger } = require('./utils/logger');

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || '0.0.0.0';

// --- Middlewares ---
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(sanitizeInput);

// --- Routes ---
app.use('/', mainRoutes);
app.use('/', paymentRoutes);
app.use('/', subscriptionRoutes);

// --- Error Handling ---
app.use((req, res) => {
  logger.warn(`404 - Route Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Not Found', message: `Route ${req.originalUrl} not found` });
});
app.use(errorHandler);

// --- Start Server ---
const server = app.listen(port, host, () => {
  logger.info(`Server started successfully - http://${host}:${port}`);
  console.log(`Server started successfully - http://${host}:${port}`);
});

// Graceful shutdown logic
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  server.close(() => {
    logger.info('Server closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
