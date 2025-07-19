const express = require('express');
const PaymentController = require('../controllers/PaymentController');
const { validatePaymentRequest, validateOrderId } = require('../middleware/validation');
const { logger } = require('../utils/logger');

const router = express.Router();
const paymentController = new PaymentController();

// 路由级别的日志中间件
router.use((req, res, next) => {
  logger.info(`支付路由请求: ${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    body: req.method === 'POST' ? req.body : undefined
  });
  next();
});

// 支付页面路由
router.get('/', (req, res, next) => {
  try {
    paymentController.showPaymentPage(req, res, next);
  } catch (error) {
    next(error);
  }
});

// 创建支付订单路由
router.post('/create', validatePaymentRequest, (req, res, next) => {
  try {
    paymentController.initiatePayment(req, res, next);
  } catch (error) {
    next(error);
  }
});

// 支付发起路由（兼容PaymentController中的表单提交）
router.post('/initiate', validatePaymentRequest, (req, res, next) => {
  try {
    paymentController.initiatePayment(req, res, next);
  } catch (error) {
    next(error);
  }
});

// 支付宝异步通知路由
router.post('/alipay/notify', (req, res, next) => {
  try {
    paymentController.handleAlipayNotify(req, res, next);
  } catch (error) {
    next(error);
  }
});

// 支付宝同步返回路由
router.get('/alipay/return', (req, res, next) => {
  logger.info('收到支付宝同步返回请求', {
    url: req.originalUrl,
    query: req.query,
    ip: req.ip
  });
  
  try {
    paymentController.handleAlipayReturn(req, res, next);
  } catch (error) {
    logger.error('处理支付宝同步返回时发生错误:', error);
    next(error);
  }
});

// 查询支付状态路由
router.get('/status/:orderId', validateOrderId, (req, res, next) => {
  try {
    paymentController.getPaymentStatus(req, res, next);
  } catch (error) {
    next(error);
  }
});

// 路由级别的错误处理
router.use((error, req, res, next) => {
  logger.error('支付路由错误:', {
    error: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query
  });
  
  // 传递给全局错误处理器
  next(error);
});

module.exports = router;