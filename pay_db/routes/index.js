const express = require('express');
const path = require('path');
const { logger } = require('../utils/logger');

const router = express.Router();

/**
 * 主路由配置
 * 处理静态资源、模板引擎和通用路由
 */

// 静态资源配置
router.use('/static', express.static(path.join(__dirname, '../public'), {
  maxAge: '1d', // 缓存1天
  etag: true,
  lastModified: true
}));

// 视图文件静态服务
router.use('/views', express.static(path.join(__dirname, '../views'), {
  maxAge: '1h', // 缓存1小时
  etag: true
}));

// 日志文件访问（仅开发环境）
if (process.env.NODE_ENV === 'development') {
  router.use('/logs', express.static(path.join(__dirname, '../logs'), {
    maxAge: 0, // 不缓存日志文件
    etag: false
  }));
}

// 根路径重定向到支付页面
router.get('/', (req, res) => {
  logger.info('访问根路径，重定向到支付页面', {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  // 如果有查询参数，保持查询参数
  const queryString = Object.keys(req.query).length > 0 
    ? '?' + new URLSearchParams(req.query).toString()
    : '';
    
  res.redirect(`/payment${queryString}`);
});

// 健康检查路由
router.get('/health', (req, res) => {
  const healthInfo = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    paymentEnv: process.env.PAYMENT_ENV || 'sandbox',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: require('../package.json').version
  };
  
  logger.info('健康检查请求', {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  res.json(healthInfo);
});

// API 信息路由
router.get('/api/info', (req, res) => {
  const apiInfo = {
    name: 'Alipay Web Payment API',
    version: require('../package.json').version,
    description: '支付宝网页支付集成服务',
    environment: process.env.NODE_ENV || 'development',
    paymentEnv: process.env.PAYMENT_ENV || 'sandbox',
    endpoints: {
      payment: '/payment',
      health: '/health',
      static: '/static',
      logs: process.env.NODE_ENV === 'development' ? '/logs' : null
    },
    timestamp: new Date().toISOString()
  };
  
  res.json(apiInfo);
});

// 路由级别的错误处理
router.use((error, req, res, next) => {
  logger.error('主路由错误:', {
    error: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    query: req.query
  });
  
  // 传递给全局错误处理器
  next(error);
});

module.exports = router;