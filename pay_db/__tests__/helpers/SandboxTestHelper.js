const SandboxConfigManager = require('../../config/SandboxConfigManager');
const PaymentService = require('../../services/PaymentService');
const OrderManager = require('../../services/OrderManager');

/**
 * 沙箱测试辅助工具类
 * 提供沙箱环境测试的通用功能
 */
class SandboxTestHelper {
  constructor() {
    this.sandboxConfig = null;
    this.paymentService = null;
    this.orderManager = null;
    this.testOrders = [];
  }

  /**
   * 初始化沙箱测试环境
   */
  async initialize() {
    try {
      // 初始化沙箱配置
      this.sandboxConfig = new SandboxConfigManager();
      
      // 验证沙箱配置
      this.sandboxConfig.validateSandboxConfig();
      
      // 初始化服务
      this.paymentService = new PaymentService();
      this.orderManager = new OrderManager();
      
      console.log('沙箱测试环境初始化成功');
      return true;
    } catch (error) {
      console.error('沙箱测试环境初始化失败:', error.message);
      throw error;
    }
  }

  /**
   * 创建测试订单
   */
  createTestOrder(customData = {}) {
    const testOrder = this.sandboxConfig.generateTestOrder(customData);
    this.testOrders.push(testOrder);
    return testOrder;
  }

  /**
   * 获取测试买家账号
   */
  getTestBuyer() {
    return this.sandboxConfig.getTestBuyer();
  }

  /**
   * 获取测试卖家账号
   */
  getTestSeller() {
    return this.sandboxConfig.getTestSeller();
  }

  /**
   * 模拟支付流程
   */
  async simulatePaymentFlow(orderData) {
    try {
      // 1. 创建订单
      const order = await this.orderManager.createOrder(orderData);
      
      // 2. 创建支付请求
      const paymentRequest = await this.paymentService.createPayment(order);
      
      // 3. 模拟支付成功回调
      const mockNotification = this.createMockNotification(order);
      
      return {
        order,
        paymentRequest,
        mockNotification
      };
    } catch (error) {
      console.error('模拟支付流程失败:', error.message);
      throw error;
    }
  }

  /**
   * 创建模拟的支付回调通知
   */
  createMockNotification(order) {
    const notification = {
      gmt_create: new Date().toISOString(),
      gmt_payment: new Date().toISOString(),
      notify_time: new Date().toISOString(),
      notify_type: 'trade_status_sync',
      notify_id: `mock_notify_${Date.now()}`,
      app_id: this.sandboxConfig.getAppId(),
      charset: 'utf-8',
      version: '1.0',
      sign_type: 'RSA2',
      trade_no: `mock_trade_${Date.now()}`,
      out_trade_no: order.outTradeNo,
      trade_status: 'TRADE_SUCCESS',
      total_amount: order.totalAmount,
      receipt_amount: order.totalAmount,
      buyer_pay_amount: order.totalAmount,
      subject: order.subject,
      body: order.body,
      buyer_logon_id: this.getTestBuyer().logonId,
      // 添加模拟签名用于测试
      sign: 'mock_signature_for_testing'
    };
    
    return notification;
  }

  /**
   * 验证支付结果
   */
  async verifyPaymentResult(order, expectedStatus = 'TRADE_SUCCESS') {
    try {
      // 查询订单状态
      const orderStatus = await this.paymentService.queryOrder(order.outTradeNo);
      
      // 验证订单状态
      if (orderStatus.tradeStatus !== expectedStatus) {
        throw new Error(`订单状态不匹配: 期望 ${expectedStatus}, 实际 ${orderStatus.tradeStatus}`);
      }
      
      return orderStatus;
    } catch (error) {
      console.error('验证支付结果失败:', error.message);
      throw error;
    }
  }

  /**
   * 等待指定时间（用于模拟异步操作）
   */
  async wait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
  }

  /**
   * 清理测试数据
   */
  async cleanup() {
    if (this.sandboxConfig.shouldCleanupAfterTest()) {
      try {
        // 清理测试订单
        for (const order of this.testOrders) {
          try {
            // 这里可以添加清理逻辑，比如取消未完成的订单
            console.log(`清理测试订单: ${order.outTradeNo}`);
          } catch (error) {
            console.warn(`清理订单失败: ${order.outTradeNo}`, error.message);
          }
        }
        
        this.testOrders = [];
        console.log('测试数据清理完成');
      } catch (error) {
        console.error('清理测试数据失败:', error.message);
      }
    }
  }

  /**
   * 获取沙箱配置
   */
  getSandboxConfig() {
    return this.sandboxConfig;
  }

  /**
   * 获取支付服务实例
   */
  getPaymentService() {
    return this.paymentService;
  }

  /**
   * 获取订单管理器实例
   */
  getOrderManager() {
    return this.orderManager;
  }

  /**
   * 生成随机测试数据
   */
  generateRandomTestData() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    
    // 生成1到9999之间的整数，然后除以100得到0.01到99.99的金额
    const cents = Math.floor(Math.random() * 9999) + 1; // 1到9999
    // 使用parseFloat和toFixed确保精度正确
    const amount = parseFloat((cents / 100).toFixed(2));
    
    return {
      outTradeNo: `TEST_${timestamp}_${random}`,
      subject: `测试订单_${random}`,
      body: `这是一个随机生成的测试订单_${random}`,
      totalAmount: amount
    };
  }

  /**
   * 验证沙箱环境连通性
   */
  async testConnectivity() {
    try {
      // 创建一个简单的测试订单来验证连通性
      const testOrder = this.createTestOrder({
        subject: '连通性测试订单',
        totalAmount: '0.01'
      });
      
      // 尝试创建支付请求
      const paymentRequest = await this.paymentService.createPayment(testOrder);
      
      if (paymentRequest && paymentRequest.body) {
        console.log('沙箱环境连通性测试成功');
        return true;
      } else {
        throw new Error('支付请求创建失败');
      }
    } catch (error) {
      console.error('沙箱环境连通性测试失败:', error.message);
      return false;
    }
  }
}

module.exports = SandboxTestHelper;