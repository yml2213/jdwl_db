const fs = require('fs');
const path = require('path');

/**
 * 支付配置管理类
 * 负责管理支付宝应用配置和环境切换
 */
class PaymentConfig {
  constructor(environment = null) {
    // 从环境变量或参数确定运行环境
    this.environment = environment || process.env.PAYMENT_ENV || 'sandbox';
    
    // 验证环境参数
    if (!['sandbox', 'production'].includes(this.environment)) {
      throw new Error(`Invalid payment environment: ${this.environment}. Must be 'sandbox' or 'production'`);
    }
    
    this.loadConfig();
  }

  /**
   * 加载配置信息
   */
  loadConfig() {
    // 基础配置
    this.appId = process.env.ALIPAY_APP_ID;
    this.privateKeyPath = process.env.ALIPAY_PRIVATE_KEY_PATH;
    this.publicKeyPath = process.env.ALIPAY_PUBLIC_KEY_PATH;
    
    // 验证必需的配置项
    this.validateRequiredConfig();
    
    // 根据环境设置网关地址
    this.setGatewayUrl();
    
    // 设置回调地址
    this.notifyUrl = process.env.NOTIFY_URL;
    this.returnUrl = process.env.RETURN_URL;
  }

  /**
   * 验证必需的配置项
   */
  validateRequiredConfig() {
    const requiredFields = ['appId', 'privateKeyPath', 'publicKeyPath'];
    const missingFields = requiredFields.filter(field => !this[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required configuration: ${missingFields.join(', ')}`);
    }
    
    // 验证密钥文件是否存在
    if (!fs.existsSync(this.privateKeyPath)) {
      throw new Error(`Private key file not found: ${this.privateKeyPath}`);
    }
    
    if (!fs.existsSync(this.publicKeyPath)) {
      throw new Error(`Public key file not found: ${this.publicKeyPath}`);
    }
  }

  /**
   * 根据环境设置网关地址
   */
  setGatewayUrl() {
    if (this.environment === 'sandbox') {
      this.gatewayUrl = process.env.ALIPAY_GATEWAY_URL || 'https://openapi-sandbox.alipay.com/gateway.do';
    } else {
      this.gatewayUrl = 'https://openapi.alipay.com/gateway.do';
    }
  }

  /**
   * 获取应用ID
   */
  getAppId() {
    return this.appId;
  }

  /**
   * 获取应用私钥
   */
  getPrivateKey() {
    try {
      return fs.readFileSync(this.privateKeyPath, 'utf8');
    } catch (error) {
      throw new Error(`Failed to read private key: ${error.message}`);
    }
  }

  /**
   * 获取支付宝公钥
   */
  getAlipayPublicKey() {
    try {
      return fs.readFileSync(this.publicKeyPath, 'utf8');
    } catch (error) {
      throw new Error(`Failed to read Alipay public key: ${error.message}`);
    }
  }

  /**
   * 获取网关地址
   */
  getGatewayUrl() {
    return this.gatewayUrl;
  }

  /**
   * 获取异步通知地址
   */
  getNotifyUrl() {
    return this.notifyUrl;
  }

  /**
   * 获取同步返回地址
   */
  getReturnUrl() {
    return this.returnUrl;
  }

  /**
   * 获取当前环境
   */
  getEnvironment() {
    return this.environment;
  }

  /**
   * 是否为沙箱环境
   */
  isSandbox() {
    return this.environment === 'sandbox';
  }

  /**
   * 是否为生产环境
   */
  isProduction() {
    return this.environment === 'production';
  }

  /**
   * 获取完整配置对象
   */
  getConfig() {
    return {
      appId: this.getAppId(),
      gatewayUrl: this.getGatewayUrl(),
      notifyUrl: this.getNotifyUrl(),
      returnUrl: this.getReturnUrl(),
      environment: this.getEnvironment(),
      isSandbox: this.isSandbox(),
      isProduction: this.isProduction()
    };
  }

  /**
   * 切换环境
   */
  switchEnvironment(newEnvironment) {
    if (!['sandbox', 'production'].includes(newEnvironment)) {
      throw new Error(`Invalid environment: ${newEnvironment}. Must be 'sandbox' or 'production'`);
    }
    
    this.environment = newEnvironment;
    this.setGatewayUrl();
    
    return this;
  }
}

module.exports = PaymentConfig;