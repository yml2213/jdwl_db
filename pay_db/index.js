const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const mainRoutes = require('./routes/index');
const paymentRoutes = require('./routes/payment');
const subscriptionRoutes = require('./routes/subscription');
const { errorHandler } = require('./middleware/errorHandler');
const { sanitizeInput } = require('./middleware/validation');
const { logger } = require('./utils/logger');

class Application {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.host = process.env.HOST || 'localhost';
    this.server = null;
    
    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  initializeMiddlewares() {
    // 安全中间件 - 暂时完全禁用helmet以解决CSP问题
    // this.app.use(helmet({
    //   contentSecurityPolicy: false
    // }));
    
    // CORS 配置
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true
    }));
    
    // 日志中间件
    this.app.use(morgan('combined', {
      stream: { write: message => logger.info(message.trim()) }
    }));
    
    // 请求解析中间件
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // 静态文件服务
    this.app.use(express.static(path.join(__dirname, 'public')));
    this.app.use('/views', express.static(path.join(__dirname, 'views')));
    
    // 设置视图引擎
    this.app.set('view engine', 'html');
    this.app.set('views', path.join(__dirname, 'views'));
    
    // 配置模板引擎（使用简单的 HTML 文件服务）
    this.app.engine('html', (filePath, options, callback) => {
      const fs = require('fs');
      fs.readFile(filePath, 'utf8', (err, content) => {
        if (err) return callback(err);
        
        // 简单的模板变量替换
        let rendered = content;
        if (options) {
          Object.keys(options).forEach(key => {
            const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
            rendered = rendered.replace(regex, options[key] || '');
          });
        }
        
        return callback(null, rendered);
      });
    });
  }

  initializeRoutes() {
    // 全局输入清理中间件
    this.app.use(sanitizeInput);
    
    // 主路由（包含静态资源、健康检查等）
    this.app.use('/', mainRoutes);
    
    // 支付相关路由
    this.app.use('/payment', paymentRoutes);
    
    // 订阅相关路由
    this.app.use('/', subscriptionRoutes);
    
    // 支付宝回调路由（直接挂载到根路径）
    this.app.use('/', paymentRoutes);
    
    // 404 处理
    this.app.use((req, res) => {
      logger.warn(`404 - 路由未找到: ${req.method} ${req.originalUrl}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`,
        timestamp: new Date().toISOString()
      });
    });
  }

  initializeErrorHandling() {
    // 全局错误处理中间件
    this.app.use(errorHandler);
  }

  start() {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, this.host, () => {
          const message = `服务器启动成功 - http://${this.host}:${this.port}`;
          logger.info(message);
          console.log(message);
          resolve(this.server);
        });

        // 处理服务器错误
        this.server.on('error', (error) => {
          if (error.code === 'EADDRINUSE') {
            const errorMessage = `端口 ${this.port} 已被占用`;
            logger.error(errorMessage);
            reject(new Error(errorMessage));
          } else {
            logger.error('服务器启动失败:', error);
            reject(error);
          }
        });

      } catch (error) {
        logger.error('应用启动失败:', error);
        reject(error);
      }
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('服务器已关闭');
          console.log('服务器已关闭');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getApp() {
    return this.app;
  }
}

// 创建应用实例
const application = new Application();

// 优雅关闭处理
const gracefulShutdown = async (signal) => {
  logger.info(`收到 ${signal} 信号，开始优雅关闭...`);
  console.log(`收到 ${signal} 信号，开始优雅关闭...`);
  
  try {
    await application.stop();
    process.exit(0);
  } catch (error) {
    logger.error('关闭过程中发生错误:', error);
    process.exit(1);
  }
};

// 监听关闭信号
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常:', error);
  console.error('未捕获的异常:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的 Promise 拒绝:', reason);
  console.error('未处理的 Promise 拒绝 at:', promise, 'reason:', reason);
  process.exit(1);
});

// 启动应用
if (require.main === module) {
  application.start().catch((error) => {
    logger.error('应用启动失败:', error);
    console.error('应用启动失败:', error);
    process.exit(1);
  });
}

module.exports = application;