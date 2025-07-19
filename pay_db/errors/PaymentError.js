const { ERROR_CODES } = require('./ErrorCodes');

/**
 * 支付相关的自定义错误类
 */
class PaymentError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'PaymentError';
    this.code = code;
    this.details = details;
    
    // 确保错误堆栈正确显示
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PaymentError);
    }
  }

  /**
   * 将错误转换为 JSON 格式
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      stack: this.stack
    };
  }

  /**
   * 获取用户友好的错误消息
   */
  getUserMessage() {
    const userMessages = {
      [ERROR_CODES.INVALID_SIGNATURE]: '签名验证失败，请稍后重试',
      [ERROR_CODES.PAYMENT_FAILED]: '支付失败，请重新尝试',
      [ERROR_CODES.ORDER_NOT_FOUND]: '订单不存在',
      [ERROR_CODES.INVALID_AMOUNT]: '支付金额无效',
      [ERROR_CODES.NETWORK_ERROR]: '网络连接异常，请稍后重试',
      [ERROR_CODES.CONFIG_ERROR]: '系统配置错误',
      [ERROR_CODES.VALIDATION_ERROR]: '参数验证失败',
      [ERROR_CODES.ORDER_STATUS_ERROR]: '订单状态异常',
      [ERROR_CODES.CALLBACK_ERROR]: '回调处理失败'
    };

    return userMessages[this.code] || '系统异常，请联系客服';
  }
}

module.exports = PaymentError;