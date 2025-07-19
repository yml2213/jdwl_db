const PaymentError = require('../errors/PaymentError');
const { ERROR_CODES, ERROR_MESSAGES, HTTP_STATUS_CODES } = require('../errors/ErrorCodes');
const { logger, PaymentLogger } = require('../utils/logger');

/**
 * 全局错误处理中间件
 */
function errorHandler(err, req, res, next) {
  // 记录错误日志
  logger.error('HTTP 请求错误', {
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    error: {
      name: err.name,
      message: err.message,
      code: err.code,
      stack: err.stack
    }
  });

  // 如果是支付相关错误，使用专用日志记录器
  if (err instanceof PaymentError) {
    PaymentLogger.logPaymentError(err, {
      url: req.url,
      method: req.method,
      ip: req.ip
    });
  }

  // 如果是 PaymentError，使用自定义处理
  if (err instanceof PaymentError) {
    return res.status(HTTP_STATUS_CODES[err.code] || 500).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        userMessage: err.getUserMessage(),
        details: err.details
      }
    });
  }

  // 处理验证错误
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: ERROR_MESSAGES[ERROR_CODES.VALIDATION_ERROR],
        userMessage: '请检查输入参数',
        details: err.message
      }
    });
  }

  // 处理 JSON 解析错误
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: '请求数据格式错误',
        userMessage: '请求格式不正确',
        details: 'Invalid JSON format'
      }
    });
  }

  // 处理 404 错误
  if (err.status === 404) {
    return res.status(404).json({
      success: false,
      error: {
        code: ERROR_CODES.ORDER_NOT_FOUND,
        message: '请求的资源不存在',
        userMessage: '页面不存在',
        details: null
      }
    });
  }

  // 默认处理未知错误
  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: process.env.NODE_ENV === 'production' 
        ? ERROR_MESSAGES[ERROR_CODES.INTERNAL_ERROR]
        : err.message,
      userMessage: '系统异常，请稍后重试',
      details: process.env.NODE_ENV === 'production' ? null : err.stack
    }
  });
}

/**
 * 404 错误处理中间件
 */
function notFoundHandler(req, res, next) {
  const error = new PaymentError(
    ERROR_CODES.ORDER_NOT_FOUND,
    `路径 ${req.originalUrl} 不存在`
  );
  error.status = 404;
  next(error);
}

/**
 * 异步错误处理包装器
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler
};