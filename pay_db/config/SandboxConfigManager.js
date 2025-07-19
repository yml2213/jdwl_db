const PaymentConfig = require('./PaymentConfig');
const sandboxConfig = require('./sandbox.config');
const path = require('path');
const fs = require('fs');

/**
 * 沙箱环境配置管理器
 * 专门用于管理沙箱测试环境的配置
 */
class SandboxConfigManager extends PaymentConfig {
  constructor() {
    super('sandbox');
    this.sandboxConfig = sandboxConfig;
    this.loadSandboxConfig();
  }

  /**
   * 加载沙箱专用配置
   */
  loadSandboxConfig() {
    // 先调用父类的配置加载
    super.loadConfig();
    
    // 如果环境变量中没有配置，则使用沙箱默认配置
    if (!this.appId) {
      this.appId = this.sandboxConfig.sandbox.appId;
    }
    if (!this.privateKeyPath) {
      this.privateKeyPath = this.sandboxConfig.sandbox.privateKeyPath;
    }
    if (!this.publicKeyPath) {
      this.publicKeyPath = this.sandboxConfig.sandbox.publicKeyPath;
    }
    if (!this.notifyUrl) {
      this.notifyUrl = this.sandboxConfig.sandbox.notifyUrl;
    }
    if (!this.returnUrl) {
      this.returnUrl = this.sandboxConfig.sandbox.returnUrl;
    }
    
    // 确保使用沙箱网关
    this.gatewayUrl = this.sandboxConfig.gatewayUrl;
  }

  /**
   * 获取沙箱测试账号信息
   */
  getTestAccounts() {
    return this.sandboxConfig.sandbox.testAccounts;
  }

  /**
   * 获取测试买家账号
   */
  getTestBuyer() {
    return this.sandboxConfig.sandbox.testAccounts.buyer;
  }

  /**
   * 获取测试卖家账号
   */
  getTestSeller() {
    return this.sandboxConfig.sandbox.testAccounts.seller;
  }

  /**
   * 获取测试订单配置
   */
  getTestOrderConfig() {
    return this.sandboxConfig.sandbox.testOrders;
  }

  /**
   * 生成测试订单数据
   */
  generateTestOrder(customData = {}) {
    const defaultOrder = this.sandboxConfig.sandbox.testOrders.defaultOrder;
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    
    return {
      outTradeNo: `TEST_${timestamp}_${random}`,
      subject: customData.subject || defaultOrder.subject,
      body: customData.body || defaultOrder.body,
      totalAmount: customData.totalAmount || defaultOrder.totalAmount,
      productCode: 'FAST_INSTANT_TRADE_PAY',
      timeoutExpress: '30m',
      ...customData
    };
  }

  /**
   * 验证沙箱环境配置
   */
  validateSandboxConfig() {
    try {
      // 验证基础配置
      this.validateRequiredConfig();
      
      // 验证沙箱特有配置
      if (!this.sandboxConfig.sandbox.testAccounts.buyer.logonId) {
        throw new Error('Missing sandbox buyer test account');
      }
      
      if (!this.sandboxConfig.sandbox.testAccounts.seller.logonId) {
        throw new Error('Missing sandbox seller test account');
      }
      
      return true;
    } catch (error) {
      throw new Error(`Sandbox configuration validation failed: ${error.message}`);
    }
  }

  /**
   * 获取测试配置
   */
  getTestingConfig() {
    return this.sandboxConfig.testing;
  }

  /**
   * 是否启用测试数据清理
   */
  shouldCleanupAfterTest() {
    return this.sandboxConfig.testing.cleanupAfterTest;
  }

  /**
   * 获取测试超时时间
   */
  getTestTimeout() {
    return this.sandboxConfig.testing.timeout;
  }

  /**
   * 获取重试次数
   */
  getRetryCount() {
    return this.sandboxConfig.testing.retryCount;
  }

  /**
   * 创建沙箱环境的完整配置对象
   */
  getSandboxConfig() {
    return {
      ...this.getConfig(),
      testAccounts: this.getTestAccounts(),
      testOrderConfig: this.getTestOrderConfig(),
      testingConfig: this.getTestingConfig()
    };
  }

  /**
   * 重置为默认沙箱配置
   */
  resetToDefaults() {
    this.loadSandboxConfig();
    return this;
  }
}

module.exports = SandboxConfigManager;