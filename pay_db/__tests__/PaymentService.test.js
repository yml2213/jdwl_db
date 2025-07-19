const PaymentService = require('../services/PaymentService');
const OrderManager = require('../services/OrderManager');
const { ORDER_STATUS } = require('../models/Order');
const fs = require('fs').promises;
const path = require('path');

// Mock environment variables
process.env.ALIPAY_APP_ID = '2021000122671234';
process.env.ALIPAY_PRIVATE_KEY_PATH = './keys/app_private_key.pem';
process.env.ALIPAY_PUBLIC_KEY_PATH = './keys/alipay_public_key.pem';
process.env.NOTIFY_URL = 'http://localhost:3000/alipay/notify';
process.env.RETURN_URL = 'http://localhost:3000/alipay/return';

describe('PaymentService - 支付订单创建', () => {
  let paymentService;
  let testDataDir;

  beforeEach(async () => {
    // 创建测试用的数据目录
    testDataDir = path.join(__dirname, 'test_data');
    await fs.mkdir(testDataDir, { recursive: true });
    
    // 使用测试数据目录初始化服务
    paymentService = new PaymentService('sandbox');
    paymentService.orderManager = new OrderManager(path.join(testDataDir, 'test_orders.json'));
    
    await paymentService.initialize();
  });

  afterEach(async () => {
    // 清理测试数据
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理错误
    }
  });

  describe('createPayment', () => {
    test('应该成功创建支付订单', async () => {
      const orderInfo = {
        outTradeNo: 'TEST_ORDER_001',
        subject: '测试商品',
        totalAmount: 99.99,
        body: '这是一个测试订单'
      };

      const order = await paymentService.createPayment(orderInfo);

      expect(order).toBeDefined();
      expect(order.outTradeNo).toBe(orderInfo.outTradeNo);
      expect(order.subject).toBe(orderInfo.subject);
      expect(order.totalAmount).toBe(orderInfo.totalAmount);
      expect(order.body).toBe(orderInfo.body);
      expect(order.status).toBe(ORDER_STATUS.PENDING);
      expect(order.id).toBeDefined();
      expect(order.createdAt).toBeInstanceOf(Date);
    });

    test('应该在缺少body时使用subject作为默认值', async () => {
      const orderInfo = {
        outTradeNo: 'TEST_ORDER_002',
        subject: '测试商品2',
        totalAmount: 50.00
      };

      const order = await paymentService.createPayment(orderInfo);

      expect(order.body).toBe(orderInfo.subject);
    });

    test('应该拒绝重复的商户订单号', async () => {
      const orderInfo = {
        outTradeNo: 'DUPLICATE_ORDER',
        subject: '重复订单测试',
        totalAmount: 10.00
      };

      // 第一次创建应该成功
      await paymentService.createPayment(orderInfo);

      // 第二次创建应该失败
      await expect(paymentService.createPayment(orderInfo))
        .rejects.toThrow('订单号 DUPLICATE_ORDER 已存在');
    });

    test('应该验证必填字段', async () => {
      // 缺少outTradeNo
      await expect(paymentService.createPayment({
        subject: '测试商品',
        totalAmount: 10.00
      })).rejects.toThrow('商户订单号(outTradeNo)是必填项且必须为字符串');

      // 缺少subject
      await expect(paymentService.createPayment({
        outTradeNo: 'TEST_ORDER_003',
        totalAmount: 10.00
      })).rejects.toThrow('订单标题(subject)是必填项且必须为字符串');

      // 缺少totalAmount
      await expect(paymentService.createPayment({
        outTradeNo: 'TEST_ORDER_004',
        subject: '测试商品'
      })).rejects.toThrow('支付金额(totalAmount)是必填项且必须为正数');
    });

    test('应该验证商户订单号格式', async () => {
      // 太短
      await expect(paymentService.createPayment({
        outTradeNo: '12345',
        subject: '测试商品',
        totalAmount: 10.00
      })).rejects.toThrow('商户订单号格式无效');

      // 太长
      await expect(paymentService.createPayment({
        outTradeNo: 'a'.repeat(65),
        subject: '测试商品',
        totalAmount: 10.00
      })).rejects.toThrow('商户订单号格式无效');

      // 包含非法字符
      await expect(paymentService.createPayment({
        outTradeNo: 'TEST-ORDER-001',
        subject: '测试商品',
        totalAmount: 10.00
      })).rejects.toThrow('商户订单号格式无效');
    });

    test('应该验证支付金额', async () => {
      // 金额太小
      await expect(paymentService.createPayment({
        outTradeNo: 'TEST_ORDER_005',
        subject: '测试商品',
        totalAmount: 0.001
      })).rejects.toThrow('支付金额必须在0.01-100000之间');

      // 金额太大
      await expect(paymentService.createPayment({
        outTradeNo: 'TEST_ORDER_006',
        subject: '测试商品',
        totalAmount: 100001
      })).rejects.toThrow('支付金额必须在0.01-100000之间');

      // 小数位数过多
      await expect(paymentService.createPayment({
        outTradeNo: 'TEST_ORDER_007',
        subject: '测试商品',
        totalAmount: 10.123
      })).rejects.toThrow('支付金额最多支持两位小数');

      // 负数
      await expect(paymentService.createPayment({
        outTradeNo: 'TEST_ORDER_008',
        subject: '测试商品',
        totalAmount: -10.00
      })).rejects.toThrow('支付金额(totalAmount)是必填项且必须为正数');
    });

    test('应该验证字符串长度限制', async () => {
      // 订单标题过长
      await expect(paymentService.createPayment({
        outTradeNo: 'TEST_ORDER_009',
        subject: 'a'.repeat(257),
        totalAmount: 10.00
      })).rejects.toThrow('订单标题长度不能超过256个字符');

      // 订单描述过长
      await expect(paymentService.createPayment({
        outTradeNo: 'TEST_ORDER_010',
        subject: '测试商品',
        totalAmount: 10.00,
        body: 'a'.repeat(401)
      })).rejects.toThrow('订单描述长度不能超过400个字符');
    });
  });

  describe('getOrder', () => {
    test('应该能够根据订单ID获取订单', async () => {
      const orderInfo = {
        outTradeNo: 'TEST_ORDER_GET_001',
        subject: '获取订单测试',
        totalAmount: 25.50
      };

      const createdOrder = await paymentService.createPayment(orderInfo);
      const retrievedOrder = await paymentService.getOrder(createdOrder.id);

      expect(retrievedOrder).toBeDefined();
      expect(retrievedOrder.id).toBe(createdOrder.id);
      expect(retrievedOrder.outTradeNo).toBe(orderInfo.outTradeNo);
    });

    test('应该在订单不存在时返回null', async () => {
      const result = await paymentService.getOrder('non_existent_order');
      expect(result).toBeNull();
    });
  });

  describe('getOrderByOutTradeNo', () => {
    test('应该能够根据商户订单号获取订单', async () => {
      const orderInfo = {
        outTradeNo: 'TEST_ORDER_GET_002',
        subject: '根据商户订单号获取测试',
        totalAmount: 15.75
      };

      await paymentService.createPayment(orderInfo);
      const retrievedOrder = await paymentService.getOrderByOutTradeNo(orderInfo.outTradeNo);

      expect(retrievedOrder).toBeDefined();
      expect(retrievedOrder.outTradeNo).toBe(orderInfo.outTradeNo);
      expect(retrievedOrder.subject).toBe(orderInfo.subject);
    });

    test('应该在订单不存在时返回null', async () => {
      const result = await paymentService.getOrderByOutTradeNo('non_existent_out_trade_no');
      expect(result).toBeNull();
    });
  });

  describe('generatePaymentUrl', () => {
    test('应该成功生成支付URL', async () => {
      const orderInfo = {
        outTradeNo: 'TEST_URL_001',
        subject: '支付URL测试商品',
        totalAmount: 88.88,
        body: '这是支付URL测试订单'
      };

      const paymentUrl = await paymentService.generatePaymentUrl(orderInfo);

      expect(paymentUrl).toBeDefined();
      expect(typeof paymentUrl).toBe('string');
      expect(paymentUrl).toContain(paymentService.config.getGatewayUrl());
      expect(paymentUrl).toContain('method=alipay.trade.page.pay');
      expect(paymentUrl).toContain(`app_id=${process.env.ALIPAY_APP_ID}`);
      expect(paymentUrl).toContain('sign_type=RSA2');
      expect(paymentUrl).toContain('sign=');
      
      // 验证业务参数是否正确编码
      expect(paymentUrl).toContain(encodeURIComponent(orderInfo.outTradeNo));
      expect(paymentUrl).toContain(encodeURIComponent(orderInfo.subject));
      expect(paymentUrl).toContain(encodeURIComponent(orderInfo.totalAmount.toFixed(2)));
    });

    test('应该在URL中包含回调地址', async () => {
      const orderInfo = {
        outTradeNo: 'TEST_URL_002',
        subject: '回调地址测试',
        totalAmount: 50.00
      };

      const paymentUrl = await paymentService.generatePaymentUrl(orderInfo);

      expect(paymentUrl).toContain(encodeURIComponent(process.env.NOTIFY_URL));
      expect(paymentUrl).toContain(encodeURIComponent(process.env.RETURN_URL));
    });

    test('应该正确处理中文字符', async () => {
      const orderInfo = {
        outTradeNo: 'TEST_URL_003',
        subject: '中文商品名称测试',
        totalAmount: 99.99,
        body: '这是一个包含中文的订单描述'
      };

      const paymentUrl = await paymentService.generatePaymentUrl(orderInfo);

      expect(paymentUrl).toBeDefined();
      expect(paymentUrl).toContain('sign=');
      // URL应该包含正确编码的中文字符
      expect(paymentUrl).toContain(encodeURIComponent(orderInfo.subject));
    });

    test('应该验证订单信息', async () => {
      // 测试无效的订单信息 - 商户订单号太短
      await expect(paymentService.generatePaymentUrl({
        outTradeNo: 'SHORT',
        subject: '测试',
        totalAmount: 10.00
      })).rejects.toThrow('商户订单号格式无效');
    });

    test('应该处理签名生成异常', async () => {
      // 创建一个配置错误的服务实例来测试异常处理
      const invalidService = new PaymentService('sandbox');
      invalidService.config.privateKeyPath = './non_existent_key.pem';

      const orderInfo = {
        outTradeNo: 'TEST_URL_004',
        subject: '异常测试',
        totalAmount: 10.00
      };

      await expect(invalidService.generatePaymentUrl(orderInfo))
        .rejects.toThrow('生成支付URL失败');
    });
  });

  describe('createPaymentAndGenerateUrl', () => {
    test('应该同时创建订单和生成支付URL', async () => {
      const orderInfo = {
        outTradeNo: 'TEST_COMBINED_001',
        subject: '组合功能测试',
        totalAmount: 66.66,
        body: '测试同时创建订单和生成URL'
      };

      const result = await paymentService.createPaymentAndGenerateUrl(orderInfo);

      expect(result).toBeDefined();
      expect(result.order).toBeDefined();
      expect(result.paymentUrl).toBeDefined();
      
      // 验证订单信息
      expect(result.order.outTradeNo).toBe(orderInfo.outTradeNo);
      expect(result.order.subject).toBe(orderInfo.subject);
      expect(result.order.totalAmount).toBe(orderInfo.totalAmount);
      expect(result.order.status).toBe(ORDER_STATUS.PENDING);
      
      // 验证支付URL
      expect(result.paymentUrl).toContain('method=alipay.trade.page.pay');
      expect(result.paymentUrl).toContain(encodeURIComponent(orderInfo.outTradeNo));
    });

    test('应该在订单创建失败时抛出异常', async () => {
      const orderInfo = {
        outTradeNo: 'DUPLICATE_COMBINED',
        subject: '重复订单测试',
        totalAmount: 10.00
      };

      // 先创建一个订单
      await paymentService.createPayment(orderInfo);

      // 再次尝试创建应该失败
      await expect(paymentService.createPaymentAndGenerateUrl(orderInfo))
        .rejects.toThrow('订单号 DUPLICATE_COMBINED 已存在');
    });
  });

  describe('handleNotifyCallback', () => {
    let testOrder;

    beforeEach(async () => {
      // 创建测试订单
      const orderInfo = {
        outTradeNo: 'NOTIFY_TEST_001',
        subject: '回调测试订单',
        totalAmount: 100.00
      };
      testOrder = await paymentService.createPayment(orderInfo);
    });

    test('应该成功处理支付成功的异步通知', async () => {
      const notifyData = {
        out_trade_no: 'NOTIFY_TEST_001',
        trade_no: '2024071522001234567890123456',
        trade_status: 'TRADE_SUCCESS',
        app_id: process.env.ALIPAY_APP_ID,
        buyer_logon_id: 'test***@alipay.com',
        total_amount: '100.00',
        sign: 'mock_signature'
      };

      // Mock签名验证成功
      jest.spyOn(paymentService.signatureService, 'verifyAlipayCallback')
        .mockReturnValue({ isValid: true });

      const result = await paymentService.handleNotifyCallback(notifyData);

      expect(result.success).toBe(true);
      expect(result.message).toBe('异步通知处理成功');
      expect(result.order).toBeDefined();
      expect(result.order.status).toBe('paid');
      expect(result.order.tradeNo).toBe(notifyData.trade_no);
    });

    test('应该处理支付失败的异步通知', async () => {
      const notifyData = {
        out_trade_no: 'NOTIFY_TEST_001',
        trade_no: '2024071522001234567890123456',
        trade_status: 'TRADE_CLOSED',
        app_id: process.env.ALIPAY_APP_ID,
        buyer_logon_id: 'test***@alipay.com',
        total_amount: '100.00',
        sign: 'mock_signature'
      };

      // Mock签名验证成功
      jest.spyOn(paymentService.signatureService, 'verifyAlipayCallback')
        .mockReturnValue({ isValid: true });

      const result = await paymentService.handleNotifyCallback(notifyData);

      expect(result.success).toBe(true);
      expect(result.order.status).toBe('failed');
    });

    test('应该拒绝签名验证失败的通知', async () => {
      const notifyData = {
        out_trade_no: 'NOTIFY_TEST_001',
        trade_no: '2024071522001234567890123456',
        trade_status: 'TRADE_SUCCESS',
        app_id: process.env.ALIPAY_APP_ID,
        sign: 'invalid_signature'
      };

      // Mock签名验证失败
      jest.spyOn(paymentService.signatureService, 'verifyAlipayCallback')
        .mockReturnValue({ isValid: false, error: '签名无效' });

      const result = await paymentService.handleNotifyCallback(notifyData);

      expect(result.success).toBe(false);
      expect(result.message).toContain('签名验证失败');
    });

    test('应该拒绝缺少必要字段的通知', async () => {
      const notifyData = {
        out_trade_no: 'NOTIFY_TEST_001',
        // 缺少 trade_no 和 trade_status
        app_id: process.env.ALIPAY_APP_ID,
        sign: 'mock_signature'
      };

      const result = await paymentService.handleNotifyCallback(notifyData);

      expect(result.success).toBe(false);
      expect(result.message).toContain('缺少必要字段');
    });

    test('应该拒绝不存在订单的通知', async () => {
      const notifyData = {
        out_trade_no: 'NON_EXISTENT_ORDER',
        trade_no: '2024071522001234567890123456',
        trade_status: 'TRADE_SUCCESS',
        app_id: process.env.ALIPAY_APP_ID,
        sign: 'mock_signature'
      };

      // Mock签名验证成功
      jest.spyOn(paymentService.signatureService, 'verifyAlipayCallback')
        .mockReturnValue({ isValid: true });

      const result = await paymentService.handleNotifyCallback(notifyData);

      expect(result.success).toBe(false);
      expect(result.message).toContain('订单不存在');
    });
  });

  describe('handleReturnCallback', () => {
    let testOrder;

    beforeEach(async () => {
      // 创建测试订单
      const orderInfo = {
        outTradeNo: 'RETURN_TEST_001',
        subject: '同步返回测试订单',
        totalAmount: 50.00
      };
      testOrder = await paymentService.createPayment(orderInfo);
    });

    test('应该成功处理同步返回', async () => {
      const returnData = {
        out_trade_no: 'RETURN_TEST_001',
        trade_no: '2024071522001234567890123456',
        trade_status: 'TRADE_SUCCESS',
        app_id: process.env.ALIPAY_APP_ID,
        total_amount: '50.00',
        sign: 'mock_signature'
      };

      // Mock签名验证成功
      jest.spyOn(paymentService.signatureService, 'verifyAlipayCallback')
        .mockReturnValue({ isValid: true });

      const result = await paymentService.handleReturnCallback(returnData);

      expect(result.success).toBe(true);
      expect(result.message).toBe('同步返回处理成功');
      expect(result.order).toBeDefined();
      expect(result.order.outTradeNo).toBe('RETURN_TEST_001');
      // 同步返回不应该更新订单状态
      expect(result.order.status).toBe('pending');
    });

    test('应该拒绝签名验证失败的同步返回', async () => {
      const returnData = {
        out_trade_no: 'RETURN_TEST_001',
        trade_no: '2024071522001234567890123456',
        trade_status: 'TRADE_SUCCESS',
        app_id: process.env.ALIPAY_APP_ID,
        sign: 'invalid_signature'
      };

      // Mock签名验证失败
      jest.spyOn(paymentService.signatureService, 'verifyAlipayCallback')
        .mockReturnValue({ isValid: false, error: '签名无效' });

      const result = await paymentService.handleReturnCallback(returnData);

      expect(result.success).toBe(false);
      expect(result.message).toContain('签名验证失败');
    });
  });

  describe('queryPaymentStatus', () => {
    test('应该能够查询存在的订单状态', async () => {
      const orderInfo = {
        outTradeNo: 'QUERY_TEST_001',
        subject: '状态查询测试',
        totalAmount: 25.00
      };

      await paymentService.createPayment(orderInfo);

      const result = await paymentService.queryPaymentStatus('QUERY_TEST_001');

      expect(result.success).toBe(true);
      expect(result.order).toBeDefined();
      expect(result.order.outTradeNo).toBe('QUERY_TEST_001');
      expect(result.order.status).toBe('pending');
    });

    test('应该处理不存在的订单查询', async () => {
      const result = await paymentService.queryPaymentStatus('NON_EXISTENT_ORDER');

      expect(result.success).toBe(false);
      expect(result.message).toContain('订单不存在');
    });
  });

  describe('_validateCallbackData', () => {
    test('应该验证有效的回调数据', () => {
      const validData = {
        out_trade_no: 'TEST_ORDER_001',
        trade_no: '2024071522001234567890123456',
        trade_status: 'TRADE_SUCCESS',
        app_id: process.env.ALIPAY_APP_ID
      };

      const result = paymentService._validateCallbackData(validData);

      expect(result.isValid).toBe(true);
    });

    test('应该拒绝无效的回调数据', () => {
      const invalidData = null;

      const result = paymentService._validateCallbackData(invalidData);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('回调数据无效');
    });

    test('应该拒绝缺少必要字段的数据', () => {
      const incompleteData = {
        out_trade_no: 'TEST_ORDER_001'
        // 缺少 trade_no 和 trade_status
      };

      const result = paymentService._validateCallbackData(incompleteData);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('缺少必要字段');
    });

    test('应该拒绝应用ID不匹配的数据', () => {
      const mismatchedData = {
        out_trade_no: 'TEST_ORDER_001',
        trade_no: '2024071522001234567890123456',
        trade_status: 'TRADE_SUCCESS',
        app_id: 'WRONG_APP_ID'
      };

      const result = paymentService._validateCallbackData(mismatchedData);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('应用ID不匹配');
    });
  });

  describe('getPaymentConfig', () => {
    test('应该返回支付配置信息', () => {
      const config = paymentService.getPaymentConfig();

      expect(config).toBeDefined();
      expect(config.appId).toBe(process.env.ALIPAY_APP_ID);
      expect(config.environment).toBe('sandbox');
      expect(config.isSandbox).toBe(true);
      expect(config.isProduction).toBe(false);
      expect(config.gatewayUrl).toContain('sandbox');
    });
  });
});