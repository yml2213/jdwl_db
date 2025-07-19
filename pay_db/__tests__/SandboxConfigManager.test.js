const SandboxConfigManager = require('../config/SandboxConfigManager');
const fs = require('fs');
const path = require('path');

describe('SandboxConfigManager', () => {
  let sandboxConfig;

  beforeEach(() => {
    // 设置测试环境变量
    process.env.PAYMENT_ENV = 'sandbox';
    process.env.ALIPAY_APP_ID = '9021000122671080';
    process.env.ALIPAY_PRIVATE_KEY_PATH = './keys/sandbox_private_key.pem';
    process.env.ALIPAY_PUBLIC_KEY_PATH = './keys/sandbox_public_key.pem';
  });

  afterEach(() => {
    // 清理环境变量
    delete process.env.PAYMENT_ENV;
    delete process.env.ALIPAY_APP_ID;
    delete process.env.ALIPAY_PRIVATE_KEY_PATH;
    delete process.env.ALIPAY_PUBLIC_KEY_PATH;
  });

  describe('构造函数和基础配置', () => {
    test('应该正确初始化沙箱配置管理器', () => {
      // 模拟密钥文件存在
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      
      sandboxConfig = new SandboxConfigManager();
      
      expect(sandboxConfig.getEnvironment()).toBe('sandbox');
      expect(sandboxConfig.isSandbox()).toBe(true);
      expect(sandboxConfig.isProduction()).toBe(false);
    });

    test('应该正确加载沙箱网关地址', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      
      sandboxConfig = new SandboxConfigManager();
      
      expect(sandboxConfig.getGatewayUrl()).toBe('https://openapi-sandbox.alipay.com/gateway.do');
    });

    test('应该正确加载沙箱应用ID', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      
      sandboxConfig = new SandboxConfigManager();
      
      expect(sandboxConfig.getAppId()).toBe('9021000122671080');
    });
  });

  describe('测试账号管理', () => {
    beforeEach(() => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      sandboxConfig = new SandboxConfigManager();
    });

    test('应该返回测试买家账号信息', () => {
      const buyer = sandboxConfig.getTestBuyer();
      
      expect(buyer).toHaveProperty('logonId');
      expect(buyer).toHaveProperty('password');
      expect(buyer).toHaveProperty('payPassword');
      expect(buyer.logonId).toBe('jfjbwb4477@sandbox.com');
    });

    test('应该返回测试卖家账号信息', () => {
      const seller = sandboxConfig.getTestSeller();
      
      expect(seller).toHaveProperty('logonId');
      expect(seller).toHaveProperty('password');
      expect(seller.logonId).toBe('test@example.com');
    });

    test('应该返回完整的测试账号信息', () => {
      const accounts = sandboxConfig.getTestAccounts();
      
      expect(accounts).toHaveProperty('buyer');
      expect(accounts).toHaveProperty('seller');
      expect(accounts.buyer.logonId).toBe('jfjbwb4477@sandbox.com');
      expect(accounts.seller.logonId).toBe('test@example.com');
    });
  });

  describe('测试订单生成', () => {
    beforeEach(() => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      sandboxConfig = new SandboxConfigManager();
    });

    test('应该生成默认测试订单', () => {
      const testOrder = sandboxConfig.generateTestOrder();
      
      expect(testOrder).toHaveProperty('outTradeNo');
      expect(testOrder).toHaveProperty('subject');
      expect(testOrder).toHaveProperty('body');
      expect(testOrder).toHaveProperty('totalAmount');
      expect(testOrder).toHaveProperty('productCode');
      expect(testOrder.outTradeNo).toMatch(/^TEST_\d+_\d+$/);
      expect(testOrder.subject).toBe('沙箱测试订单');
      expect(testOrder.totalAmount).toBe('0.01');
      expect(testOrder.productCode).toBe('FAST_INSTANT_TRADE_PAY');
    });

    test('应该生成自定义测试订单', () => {
      const customData = {
        subject: '自定义测试订单',
        totalAmount: '1.00',
        body: '自定义订单描述'
      };
      
      const testOrder = sandboxConfig.generateTestOrder(customData);
      
      expect(testOrder.subject).toBe('自定义测试订单');
      expect(testOrder.totalAmount).toBe('1.00');
      expect(testOrder.body).toBe('自定义订单描述');
      expect(testOrder.outTradeNo).toMatch(/^TEST_\d+_\d+$/);
    });

    test('应该返回测试订单配置', () => {
      const orderConfig = sandboxConfig.getTestOrderConfig();
      
      expect(orderConfig).toHaveProperty('minAmount');
      expect(orderConfig).toHaveProperty('maxAmount');
      expect(orderConfig).toHaveProperty('defaultOrder');
      expect(orderConfig.minAmount).toBe(0.01);
      expect(orderConfig.maxAmount).toBe(100.00);
    });
  });

  describe('测试配置管理', () => {
    beforeEach(() => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      sandboxConfig = new SandboxConfigManager();
    });

    test('应该返回测试配置', () => {
      const testingConfig = sandboxConfig.getTestingConfig();
      
      expect(testingConfig).toHaveProperty('timeout');
      expect(testingConfig).toHaveProperty('retryCount');
      expect(testingConfig).toHaveProperty('cleanupAfterTest');
      expect(testingConfig.timeout).toBe(30000);
      expect(testingConfig.retryCount).toBe(3);
    });

    test('应该返回正确的测试超时时间', () => {
      expect(sandboxConfig.getTestTimeout()).toBe(30000);
    });

    test('应该返回正确的重试次数', () => {
      expect(sandboxConfig.getRetryCount()).toBe(3);
    });

    test('应该返回清理配置', () => {
      expect(sandboxConfig.shouldCleanupAfterTest()).toBe(true);
    });
  });

  describe('配置验证', () => {
    test('应该验证有效的沙箱配置', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      sandboxConfig = new SandboxConfigManager();
      
      expect(() => {
        sandboxConfig.validateSandboxConfig();
      }).not.toThrow();
    });

    test('应该在密钥文件不存在时抛出错误', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      
      expect(() => {
        new SandboxConfigManager();
      }).toThrow('Private key file not found');
    });
  });

  describe('完整配置获取', () => {
    beforeEach(() => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      sandboxConfig = new SandboxConfigManager();
    });

    test('应该返回完整的沙箱配置', () => {
      const config = sandboxConfig.getSandboxConfig();
      
      expect(config).toHaveProperty('appId');
      expect(config).toHaveProperty('gatewayUrl');
      expect(config).toHaveProperty('environment');
      expect(config).toHaveProperty('testAccounts');
      expect(config).toHaveProperty('testOrderConfig');
      expect(config).toHaveProperty('testingConfig');
      expect(config.environment).toBe('sandbox');
      expect(config.isSandbox).toBe(true);
    });
  });

  describe('配置重置', () => {
    beforeEach(() => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      sandboxConfig = new SandboxConfigManager();
    });

    test('应该能够重置为默认配置', () => {
      const resetConfig = sandboxConfig.resetToDefaults();
      
      expect(resetConfig).toBeInstanceOf(SandboxConfigManager);
      expect(resetConfig.getEnvironment()).toBe('sandbox');
      expect(resetConfig.getAppId()).toBe('9021000122671080');
    });
  });
});