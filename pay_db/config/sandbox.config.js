/**
 * 沙箱环境专用配置
 * 包含沙箱测试所需的所有配置参数
 */

const sandboxConfig = {
  // 沙箱环境基础配置
  environment: 'sandbox',
  
  // 支付宝沙箱网关地址
  gatewayUrl: 'https://openapi-sandbox.alipay.com/gateway.do',
  
  // 沙箱应用配置（示例配置，实际使用时需要替换）
  sandbox: {
    // 沙箱应用ID（需要从支付宝开放平台获取）
    appId: process.env.ALIPAY_SANDBOX_APP_ID || '9021000122671080',
    
    // 沙箱私钥路径
    privateKeyPath: process.env.ALIPAY_SANDBOX_PRIVATE_KEY_PATH || './keys/sandbox_private_key.pem',
    
    // 沙箱支付宝公钥路径
    publicKeyPath: process.env.ALIPAY_SANDBOX_PUBLIC_KEY_PATH || './keys/sandbox_public_key.pem',
    
    // 沙箱回调地址
    notifyUrl: process.env.SANDBOX_NOTIFY_URL || 'http://localhost:3000/alipay/notify',
    returnUrl: process.env.SANDBOX_RETURN_URL || 'http://localhost:3000/alipay/return',
    
    // 沙箱测试账号信息
    testAccounts: {
      buyer: {
        // 沙箱买家账号
        logonId: 'jfjbwb4477@sandbox.com',
        password: '111111',
        payPassword: '111111'
      },
      seller: {
        // 沙箱卖家账号
        logonId: 'test@example.com',
        password: '111111'
      }
    },
    
    // 测试订单配置
    testOrders: {
      // 测试金额范围
      minAmount: 0.01,
      maxAmount: 100.00,
      
      // 默认测试订单
      defaultOrder: {
        subject: '沙箱测试订单',
        body: '这是一个沙箱环境的测试订单',
        totalAmount: '0.01'
      }
    }
  },
  
  // 测试配置
  testing: {
    // 测试超时时间（毫秒）
    timeout: 30000,
    
    // 重试次数
    retryCount: 3,
    
    // 测试数据清理
    cleanupAfterTest: true,
    
    // 模拟延迟（毫秒）
    simulateDelay: 1000
  }
};

module.exports = sandboxConfig;