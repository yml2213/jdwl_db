const winston = require('winston');
const { logger, PaymentLogger } = require('../utils/logger');
const PaymentError = require('../errors/PaymentError');
const { ERROR_CODES } = require('../errors/ErrorCodes');

// 模拟 winston 传输器
const mockTransports = {
  file: [],
  console: []
};

// 创建模拟传输器
const createMockTransport = (type) => ({
  log: jest.fn(),
  write: jest.fn(),
  type: type
});

describe('Logger 配置', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('应该正确配置 winston logger', () => {
    expect(logger).toBeDefined();
    expect(logger.level).toBeDefined();
    expect(logger.transports).toBeDefined();
    expect(logger.transports.length).toBeGreaterThan(0);
  });

  test('应该在非生产环境包含控制台传输器', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    
    // 重新加载模块以应用环境变量
    delete require.cache[require.resolve('../utils/logger')];
    const { logger: devLogger } = require('../utils/logger');
    
    const hasConsoleTransport = devLogger.transports.some(
      transport => transport.constructor.name === 'Console'
    );
    expect(hasConsoleTransport).toBe(true);
    
    process.env.NODE_ENV = originalEnv;
  });
});

describe('PaymentLogger', () => {
  let logSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('logOrderCreation', () => {
    test('应该记录订单创建日志', () => {
      const orderData = {
        id: 'order_123',
        outTradeNo: 'trade_456',
        totalAmount: 100.00,
        subject: '测试商品'
      };
      const userId = 'user_789';

      PaymentLogger.logOrderCreation(orderData, userId);

      expect(logSpy).toHaveBeenCalledWith('订单创建', {
        event: 'ORDER_CREATED',
        orderId: 'order_123',
        outTradeNo: 'trade_456',
        amount: 100.00,
        subject: '测试商品',
        userId: 'user_789',
        timestamp: expect.any(String)
      });
    });

    test('应该在没有用户ID时记录订单创建日志', () => {
      const orderData = {
        id: 'order_123',
        outTradeNo: 'trade_456',
        totalAmount: 50.00,
        subject: '测试商品2'
      };

      PaymentLogger.logOrderCreation(orderData);

      expect(logSpy).toHaveBeenCalledWith('订单创建', {
        event: 'ORDER_CREATED',
        orderId: 'order_123',
        outTradeNo: 'trade_456',
        amount: 50.00,
        subject: '测试商品2',
        userId: null,
        timestamp: expect.any(String)
      });
    });
  });

  describe('logPaymentInitiation', () => {
    test('应该记录支付发起成功日志', () => {
      const orderData = {
        id: 'order_123',
        outTradeNo: 'trade_456',
        totalAmount: 100.00
      };
      const paymentUrl = 'https://openapi.alipay.com/gateway.do?...';

      PaymentLogger.logPaymentInitiation(orderData, paymentUrl);

      expect(logSpy).toHaveBeenCalledWith('支付发起', {
        event: 'PAYMENT_INITIATED',
        orderId: 'order_123',
        outTradeNo: 'trade_456',
        amount: 100.00,
        paymentUrl: 'generated',
        timestamp: expect.any(String)
      });
    });

    test('应该记录支付发起失败日志', () => {
      const orderData = {
        id: 'order_123',
        outTradeNo: 'trade_456',
        totalAmount: 100.00
      };

      PaymentLogger.logPaymentInitiation(orderData, null);

      expect(logSpy).toHaveBeenCalledWith('支付发起', {
        event: 'PAYMENT_INITIATED',
        orderId: 'order_123',
        outTradeNo: 'trade_456',
        amount: 100.00,
        paymentUrl: 'failed',
        timestamp: expect.any(String)
      });
    });
  });

  describe('logPaymentStatusChange', () => {
    test('应该记录支付状态变更日志', () => {
      PaymentLogger.logPaymentStatusChange('order_123', 'pending', 'paid', 'alipay_trade_123');

      expect(logSpy).toHaveBeenCalledWith('支付状态变更', {
        event: 'PAYMENT_STATUS_CHANGED',
        orderId: 'order_123',
        oldStatus: 'pending',
        newStatus: 'paid',
        tradeNo: 'alipay_trade_123',
        timestamp: expect.any(String)
      });
    });

    test('应该在没有交易号时记录状态变更日志', () => {
      PaymentLogger.logPaymentStatusChange('order_123', 'pending', 'failed');

      expect(logSpy).toHaveBeenCalledWith('支付状态变更', {
        event: 'PAYMENT_STATUS_CHANGED',
        orderId: 'order_123',
        oldStatus: 'pending',
        newStatus: 'failed',
        tradeNo: null,
        timestamp: expect.any(String)
      });
    });
  });

  describe('logCallbackReceived', () => {
    test('应该记录异步通知回调日志', () => {
      const callbackData = {
        out_trade_no: 'trade_456',
        trade_no: 'alipay_trade_123',
        trade_status: 'TRADE_SUCCESS',
        total_amount: '100.00'
      };

      PaymentLogger.logCallbackReceived('notify', callbackData);

      expect(logSpy).toHaveBeenCalledWith('支付回调接收', {
        event: 'CALLBACK_RECEIVED',
        callbackType: 'notify',
        outTradeNo: 'trade_456',
        tradeNo: 'alipay_trade_123',
        tradeStatus: 'TRADE_SUCCESS',
        totalAmount: '100.00',
        timestamp: expect.any(String)
      });
    });

    test('应该记录同步返回回调日志', () => {
      const callbackData = {
        out_trade_no: 'trade_456',
        trade_no: 'alipay_trade_123',
        trade_status: 'TRADE_SUCCESS',
        total_amount: '100.00'
      };

      PaymentLogger.logCallbackReceived('return', callbackData);

      expect(logSpy).toHaveBeenCalledWith('支付回调接收', {
        event: 'CALLBACK_RECEIVED',
        callbackType: 'return',
        outTradeNo: 'trade_456',
        tradeNo: 'alipay_trade_123',
        tradeStatus: 'TRADE_SUCCESS',
        totalAmount: '100.00',
        timestamp: expect.any(String)
      });
    });
  });

  describe('logSignatureVerification', () => {
    test('应该记录签名验证成功日志', () => {
      PaymentLogger.logSignatureVerification(true, 'trade_456', { algorithm: 'RSA2' });

      expect(logger.log).toHaveBeenCalledWith('info', '签名验证', {
        event: 'SIGNATURE_VERIFICATION',
        success: true,
        outTradeNo: 'trade_456',
        details: { algorithm: 'RSA2' },
        timestamp: expect.any(String)
      });
    });

    test('应该记录签名验证失败日志', () => {
      PaymentLogger.logSignatureVerification(false, 'trade_456', { reason: 'invalid_signature' });

      expect(logger.log).toHaveBeenCalledWith('warn', '签名验证', {
        event: 'SIGNATURE_VERIFICATION',
        success: false,
        outTradeNo: 'trade_456',
        details: { reason: 'invalid_signature' },
        timestamp: expect.any(String)
      });
    });
  });

  describe('logPaymentError', () => {
    test('应该记录支付异常日志', () => {
      const error = new PaymentError(ERROR_CODES.PAYMENT_FAILED, '支付处理失败');
      const context = { orderId: 'order_123', amount: 100.00 };

      PaymentLogger.logPaymentError(error, context);

      expect(logger.error).toHaveBeenCalledWith('支付异常', {
        event: 'PAYMENT_ERROR',
        errorCode: ERROR_CODES.PAYMENT_FAILED,
        errorMessage: '支付处理失败',
        errorStack: expect.any(String),
        context: context,
        timestamp: expect.any(String)
      });
    });

    test('应该在没有上下文时记录支付异常日志', () => {
      const error = new PaymentError(ERROR_CODES.NETWORK_ERROR, '网络连接失败');

      PaymentLogger.logPaymentError(error);

      expect(logger.error).toHaveBeenCalledWith('支付异常', {
        event: 'PAYMENT_ERROR',
        errorCode: ERROR_CODES.NETWORK_ERROR,
        errorMessage: '网络连接失败',
        errorStack: expect.any(String),
        context: {},
        timestamp: expect.any(String)
      });
    });
  });

  describe('logApiCall', () => {
    test('应该记录成功的 API 调用日志', () => {
      const params = { out_trade_no: 'trade_456', total_amount: '100.00' };
      const response = { code: '10000', msg: 'Success' };

      PaymentLogger.logApiCall('alipay.trade.page.pay', params, true, response);

      expect(logSpy).toHaveBeenCalledWith('API 调用', {
        event: 'API_CALL',
        apiName: 'alipay.trade.page.pay',
        params: params,
        success: true,
        response: response,
        error: null,
        timestamp: expect.any(String)
      });
    });

    test('应该记录失败的 API 调用日志', () => {
      const params = { out_trade_no: 'trade_456' };
      const error = new Error('API 调用失败');
      error.code = 'API_ERROR';

      PaymentLogger.logApiCall('alipay.trade.page.pay', params, false, null, error);

      expect(logger.error).toHaveBeenCalledWith('API 调用', {
        event: 'API_CALL',
        apiName: 'alipay.trade.page.pay',
        params: params,
        success: false,
        response: null,
        error: {
          message: 'API 调用失败',
          code: 'API_ERROR'
        },
        timestamp: expect.any(String)
      });
    });
  });

  describe('logSystemStart', () => {
    test('应该记录系统启动日志', () => {
      const config = {
        environment: 'sandbox',
        port: 3000
      };

      PaymentLogger.logSystemStart(config);

      expect(logSpy).toHaveBeenCalledWith('系统启动', {
        event: 'SYSTEM_START',
        environment: expect.any(String),
        paymentEnv: 'sandbox',
        port: 3000,
        timestamp: expect.any(String)
      });
    });
  });

  describe('logSystemShutdown', () => {
    test('应该记录正常系统关闭日志', () => {
      PaymentLogger.logSystemShutdown();

      expect(logSpy).toHaveBeenCalledWith('系统关闭', {
        event: 'SYSTEM_SHUTDOWN',
        reason: 'normal',
        timestamp: expect.any(String)
      });
    });

    test('应该记录异常系统关闭日志', () => {
      PaymentLogger.logSystemShutdown('error');

      expect(logSpy).toHaveBeenCalledWith('系统关闭', {
        event: 'SYSTEM_SHUTDOWN',
        reason: 'error',
        timestamp: expect.any(String)
      });
    });
  });

  describe('日志时间戳', () => {
    test('所有日志方法都应该包含有效的时间戳', () => {
      const orderData = { id: 'test', outTradeNo: 'test', totalAmount: 100, subject: 'test' };
      
      PaymentLogger.logOrderCreation(orderData);
      
      const logCall = logSpy.mock.calls[0];
      const logData = logCall[1];
      
      expect(logData.timestamp).toBeDefined();
      expect(new Date(logData.timestamp)).toBeInstanceOf(Date);
      expect(new Date(logData.timestamp).getTime()).not.toBeNaN();
    });
  });
});