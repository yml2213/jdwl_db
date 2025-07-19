require('dotenv').config();
const PaymentConfig = require('./PaymentConfig');

// 创建支付配置实例
let paymentConfig;
try {
  paymentConfig = new PaymentConfig();
} catch (error) {
  console.error('Failed to initialize PaymentConfig:', error.message);
  // 在配置失败时提供基本的回退配置
  paymentConfig = null;
}

module.exports = {
  // 服务器配置
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || 'localhost',
    env: process.env.NODE_ENV || 'development'
  },

  // 支付宝配置 - 使用新的 PaymentConfig 类
  alipay: {
    appId: process.env.ALIPAY_APP_ID,
    privateKeyPath: process.env.ALIPAY_PRIVATE_KEY_PATH,
    publicKeyPath: process.env.ALIPAY_PUBLIC_KEY_PATH,
    gatewayUrl: process.env.ALIPAY_GATEWAY_URL,
    paymentEnv: process.env.PAYMENT_ENV || 'sandbox'
  },

  // 回调地址配置
  callback: {
    notifyUrl: process.env.NOTIFY_URL,
    returnUrl: process.env.RETURN_URL
  },

  // 新的支付配置管理器
  paymentConfig: paymentConfig,

  // 获取支付配置的便捷方法
  getPaymentConfig: () => {
    if (!paymentConfig) {
      throw new Error('PaymentConfig not initialized. Please check your environment variables.');
    }
    return paymentConfig;
  }
};