const PaymentController = require('../controllers/PaymentController');
const PaymentService = require('../services/PaymentService');
const { ORDER_STATUS } = require('../models/Order');

// Mock PaymentService
jest.mock('../services/PaymentService');

describe('PaymentController', () => {
  let controller;
  let mockPaymentService;
  let mockReq;
  let mockRes;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create controller instance
    controller = new PaymentController();
    
    // Mock PaymentService instance
    mockPaymentService = {
      createPaymentAndGenerateUrl: jest.fn(),
      handleNotifyCallback: jest.fn(),
      handleReturnCallback: jest.fn(),
      queryPaymentStatus: jest.fn()
    };
    
    controller.paymentService = mockPaymentService;

    // Mock Express request and response objects
    mockReq = {
      query: {},
      body: {},
      params: {},
      headers: {},
      ip: '127.0.0.1',
      connection: {
        remoteAddress: '127.0.0.1'
      }
    };

    mockRes = {
      send: jest.fn(),
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      redirect: jest.fn()
    };
  });

  describe('showPaymentPage', () => {
    it('should display payment page with default values', async () => {
      await controller.showPaymentPage(mockReq, mockRes);

      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining('确认支付')
      );
      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining('商品-测试')
      );
      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining('¥ 0.01')
      );
    });

    it('should display payment page with custom order info', async () => {
      mockReq.query = {
        outTradeNo: 'TEST_ORDER_123',
        subject: '测试商品',
        totalAmount: '99.99',
        body: '这是测试商品描述'
      };

      await controller.showPaymentPage(mockReq, mockRes);

      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining('TEST_ORDER_123')
      );
      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining('测试商品')
      );
      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining('¥ 99.99')
      );
    });

    it('should return error for invalid amount', async () => {
      mockReq.query = {
        totalAmount: 'invalid'
      };

      await controller.showPaymentPage(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.send).toHaveBeenCalledWith('无效的支付金额');
    });
  });

  describe('initiatePayment', () => {
    it('should successfully initiate payment and redirect', async () => {
      mockReq.body = {
        outTradeNo: 'TEST_ORDER_123',
        subject: '测试商品',
        totalAmount: '99.99',
        body: '测试描述'
      };

      const mockOrder = {
        id: 'order_123',
        outTradeNo: 'TEST_ORDER_123',
        subject: '测试商品',
        totalAmount: 99.99,
        status: ORDER_STATUS.PENDING
      };

      const mockResult = {
        order: mockOrder,
        paymentUrl: 'https://openapi.alipaydev.com/gateway.do?...'
      };

      mockPaymentService.createPaymentAndGenerateUrl.mockResolvedValue(mockResult);

      await controller.initiatePayment(mockReq, mockRes);

      expect(mockPaymentService.createPaymentAndGenerateUrl).toHaveBeenCalledWith({
        outTradeNo: 'TEST_ORDER_123',
        subject: '测试商品',
        totalAmount: 99.99,
        body: '测试描述'
      });
      expect(mockRes.redirect).toHaveBeenCalledWith(mockResult.paymentUrl);
    });

    it('should return error for missing required parameters', async () => {
      mockReq.body = {
        subject: '测试商品'
        // Missing outTradeNo and totalAmount
      };

      await controller.initiatePayment(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: '缺少必填参数: outTradeNo, subject, totalAmount'
      });
    });

    it('should return error for invalid amount', async () => {
      mockReq.body = {
        outTradeNo: 'TEST_ORDER_123',
        subject: '测试商品',
        totalAmount: 'invalid'
      };

      await controller.initiatePayment(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: '无效的支付金额'
      });
    });

    it('should return error for invalid order number format', async () => {
      mockReq.body = {
        outTradeNo: '123', // Too short
        subject: '测试商品',
        totalAmount: '99.99'
      };

      await controller.initiatePayment(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: '订单号格式无效，必须为6-64位字母数字下划线组合'
      });
    });

    it('should return error for amount out of range', async () => {
      mockReq.body = {
        outTradeNo: 'TEST_ORDER_123',
        subject: '测试商品',
        totalAmount: '200000' // Too large
      };

      await controller.initiatePayment(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: '支付金额必须在0.01-100000之间'
      });
    });

    it('should return error for too many decimal places', async () => {
      mockReq.body = {
        outTradeNo: 'TEST_ORDER_123',
        subject: '测试商品',
        totalAmount: '99.999' // Three decimal places
      };

      await controller.initiatePayment(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: '支付金额最多支持两位小数'
      });
    });

    it('should return error for empty string parameters', async () => {
      mockReq.body = {
        outTradeNo: '   ', // Empty after trim
        subject: '测试商品',
        totalAmount: '99.99'
      };

      await controller.initiatePayment(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: '订单号必须为非空字符串'
      });
    });

    it('should return error for subject too long', async () => {
      mockReq.body = {
        outTradeNo: 'TEST_ORDER_123',
        subject: 'a'.repeat(300), // Too long
        totalAmount: '99.99'
      };

      await controller.initiatePayment(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: '商品标题长度不能超过256个字符'
      });
    });

    it('should handle payment service errors', async () => {
      mockReq.body = {
        outTradeNo: 'TEST_ORDER_123',
        subject: '测试商品',
        totalAmount: '99.99'
      };

      mockPaymentService.createPaymentAndGenerateUrl.mockRejectedValue(
        new Error('支付服务错误')
      );

      await controller.initiatePayment(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining('支付发起失败')
      );
    });
  });

  describe('handleAlipayNotify', () => {
    it('should handle successful notify callback', async () => {
      mockReq.body = {
        out_trade_no: 'TEST_ORDER_123',
        trade_no: 'ALIPAY_TRADE_123',
        trade_status: 'TRADE_SUCCESS'
      };

      mockPaymentService.handleNotifyCallback.mockResolvedValue({
        success: true,
        message: '处理成功'
      });

      await controller.handleAlipayNotify(mockReq, mockRes);

      expect(mockPaymentService.handleNotifyCallback).toHaveBeenCalledWith(mockReq.body);
      expect(mockRes.send).toHaveBeenCalledWith('success');
    });

    it('should handle failed notify callback', async () => {
      mockReq.body = {
        out_trade_no: 'TEST_ORDER_123',
        trade_no: 'ALIPAY_TRADE_123',
        trade_status: 'TRADE_SUCCESS'
      };

      mockPaymentService.handleNotifyCallback.mockResolvedValue({
        success: false,
        message: '签名验证失败'
      });

      await controller.handleAlipayNotify(mockReq, mockRes);

      expect(mockRes.send).toHaveBeenCalledWith('failure');
    });

    it('should handle notify callback exceptions', async () => {
      mockReq.body = {
        out_trade_no: 'TEST_ORDER_123'
      };

      mockPaymentService.handleNotifyCallback.mockRejectedValue(
        new Error('处理异常')
      );

      await controller.handleAlipayNotify(mockReq, mockRes);

      expect(mockRes.send).toHaveBeenCalledWith('failure');
    });
  });

  describe('handleAlipayReturn', () => {
    it('should handle successful return with paid order', async () => {
      mockReq.query = {
        out_trade_no: 'TEST_ORDER_123',
        trade_no: 'ALIPAY_TRADE_123',
        trade_status: 'TRADE_SUCCESS'
      };

      const mockOrder = {
        id: 'order_123',
        outTradeNo: 'TEST_ORDER_123',
        subject: '测试商品',
        totalAmount: 99.99,
        status: ORDER_STATUS.PAID,
        tradeNo: 'ALIPAY_TRADE_123',
        paymentTime: new Date()
      };

      mockPaymentService.handleReturnCallback.mockResolvedValue({
        success: true,
        order: mockOrder
      });

      await controller.handleAlipayReturn(mockReq, mockRes);

      expect(mockPaymentService.handleReturnCallback).toHaveBeenCalledWith(mockReq.query);
      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining('支付成功')
      );
    });

    it('should handle successful return with pending order', async () => {
      mockReq.query = {
        out_trade_no: 'TEST_ORDER_123',
        trade_no: 'ALIPAY_TRADE_123',
        trade_status: 'WAIT_BUYER_PAY'
      };

      const mockOrder = {
        id: 'order_123',
        outTradeNo: 'TEST_ORDER_123',
        subject: '测试商品',
        totalAmount: 99.99,
        status: ORDER_STATUS.PENDING
      };

      mockPaymentService.handleReturnCallback.mockResolvedValue({
        success: true,
        order: mockOrder
      });

      await controller.handleAlipayReturn(mockReq, mockRes);

      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining('支付处理中')
      );
    });

    it('should handle failed return callback', async () => {
      mockReq.query = {
        out_trade_no: 'TEST_ORDER_123'
      };

      mockPaymentService.handleReturnCallback.mockResolvedValue({
        success: false,
        message: '订单不存在'
      });

      await controller.handleAlipayReturn(mockReq, mockRes);

      expect(mockRes.send).toHaveBeenCalledWith(
        expect.stringContaining('支付处理失败')
      );
    });
  });

  describe('getPaymentStatus', () => {
    it('should return payment status successfully', async () => {
      mockReq.params = {
        outTradeNo: 'TEST_ORDER_123'
      };

      const mockOrder = {
        id: 'order_123',
        outTradeNo: 'TEST_ORDER_123',
        subject: '测试商品',
        totalAmount: 99.99,
        status: ORDER_STATUS.PAID
      };

      mockPaymentService.queryPaymentStatus.mockResolvedValue({
        success: true,
        order: mockOrder
      });

      await controller.getPaymentStatus(mockReq, mockRes);

      expect(mockPaymentService.queryPaymentStatus).toHaveBeenCalledWith('TEST_ORDER_123');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        order: mockOrder
      });
    });

    it('should return error for missing order number', async () => {
      mockReq.params = {};

      await controller.getPaymentStatus(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: '缺少订单号参数'
      });
    });

    it('should return error for non-existent order', async () => {
      mockReq.params = {
        outTradeNo: 'NON_EXISTENT_ORDER'
      };

      mockPaymentService.queryPaymentStatus.mockResolvedValue({
        success: false,
        message: '订单不存在: NON_EXISTENT_ORDER'
      });

      await controller.getPaymentStatus(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: '订单不存在: NON_EXISTENT_ORDER'
      });
    });
  });

  describe('HTML generation methods', () => {
    it('should escape HTML in generated pages', () => {
      const order = {
        outTradeNo: '<script>alert("xss")</script>',
        subject: 'Test & Product',
        totalAmount: 99.99,
        status: ORDER_STATUS.PAID
      };

      const html = controller._generateSuccessPageHTML(order);

      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('Test &amp; Product');
      expect(html).not.toContain('<script>alert("xss")</script>');
    });

    it('should generate error page HTML', () => {
      const html = controller._generateErrorPageHTML('测试错误', '这是错误消息');

      expect(html).toContain('测试错误');
      expect(html).toContain('这是错误消息');
      expect(html).toContain('返回首页');
    });
  });
});