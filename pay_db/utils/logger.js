const winston = require('winston');
const path = require('path');

// 创建日志目录（如果不存在）
const logDir = path.join(__dirname, '../logs');

// 定义日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// 控制台输出格式
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += `\n${JSON.stringify(meta, null, 2)}`;
    }
    return msg;
  })
);

// 创建 Winston logger 实例
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'alipay-payment' },
  transports: [
    // 错误日志文件
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),
    
    // 组合日志文件
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),
    
    // 支付相关日志文件
    new winston.transports.File({
      filename: path.join(logDir, 'payment.log'),
      level: 'info',
      maxsize: 5242880, // 5MB
      maxFiles: 10,
      tailable: true,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ],
  
  // 异常处理
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'exceptions.log')
    })
  ],
  
  // 拒绝处理
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'rejections.log')
    })
  ]
});

// 在非生产环境添加控制台输出
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
}

/**
 * 支付流程专用日志记录器
 */
class PaymentLogger {
  /**
   * 记录订单创建日志
   */
  static logOrderCreation(orderData, userId = null) {
    logger.info('订单创建', {
      event: 'ORDER_CREATED',
      orderId: orderData.id,
      outTradeNo: orderData.outTradeNo,
      amount: orderData.totalAmount,
      subject: orderData.subject,
      userId: userId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 记录支付发起日志
   */
  static logPaymentInitiation(orderData, paymentUrl) {
    logger.info('支付发起', {
      event: 'PAYMENT_INITIATED',
      orderId: orderData.id,
      outTradeNo: orderData.outTradeNo,
      amount: orderData.totalAmount,
      paymentUrl: paymentUrl ? 'generated' : 'failed',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 记录支付状态变更日志
   */
  static logPaymentStatusChange(orderId, oldStatus, newStatus, tradeNo = null) {
    logger.info('支付状态变更', {
      event: 'PAYMENT_STATUS_CHANGED',
      orderId: orderId,
      oldStatus: oldStatus,
      newStatus: newStatus,
      tradeNo: tradeNo,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 记录支付回调接收日志
   */
  static logCallbackReceived(callbackType, data) {
    logger.info('支付回调接收', {
      event: 'CALLBACK_RECEIVED',
      callbackType: callbackType, // 'notify' 或 'return'
      outTradeNo: data.out_trade_no,
      tradeNo: data.trade_no,
      tradeStatus: data.trade_status,
      totalAmount: data.total_amount,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 记录签名验证日志
   */
  static logSignatureVerification(success, outTradeNo, details = null) {
    const level = success ? 'info' : 'warn';
    logger.log(level, '签名验证', {
      event: 'SIGNATURE_VERIFICATION',
      success: success,
      outTradeNo: outTradeNo,
      details: details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 记录支付异常日志
   */
  static logPaymentError(error, context = {}) {
    logger.error('支付异常', {
      event: 'PAYMENT_ERROR',
      errorCode: error.code,
      errorMessage: error.message,
      errorStack: error.stack,
      context: context,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 记录 API 调用日志
   */
  static logApiCall(apiName, params, success, response = null, error = null) {
    if (success) {
      logger.info('API 调用', {
        event: 'API_CALL',
        apiName: apiName,
        params: params,
        success: success,
        response: response,
        error: null,
        timestamp: new Date().toISOString()
      });
    } else {
      logger.error('API 调用', {
        event: 'API_CALL',
        apiName: apiName,
        params: params,
        success: success,
        response: response,
        error: error ? {
          message: error.message,
          code: error.code
        } : null,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * 记录系统启动日志
   */
  static logSystemStart(config) {
    logger.info('系统启动', {
      event: 'SYSTEM_START',
      environment: process.env.NODE_ENV || 'development',
      paymentEnv: config.environment,
      port: config.port,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 记录系统关闭日志
   */
  static logSystemShutdown(reason = 'normal') {
    logger.info('系统关闭', {
      event: 'SYSTEM_SHUTDOWN',
      reason: reason,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = {
  logger,
  PaymentLogger
};