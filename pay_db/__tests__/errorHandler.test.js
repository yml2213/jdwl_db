const { errorHandler, notFoundHandler, asyncHandler } = require('../middleware/errorHandler');
const PaymentError = require('../errors/PaymentError');
const { ERROR_CODES } = require('../errors/ErrorCodes');

describe('errorHandler 中间件', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      url: '/test',
      method: 'GET',
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-user-agent')
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();

    // 模拟 console.error 以避免测试输出污染
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('PaymentError 处理', () => {
    test('应该正确处理 PaymentError', () => {
      const error = new PaymentError(
        ERROR_CODES.INVALID_SIGNATURE,
        '签名验证失败',
        { signature: 'invalid' }
      );

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: ERROR_CODES.INVALID_SIGNATURE,
          message: '签名验证失败',
          userMessage: '签名验证失败，请稍后重试',
          details: { signature: 'invalid' }
        }
      });
    });

    test('应该为未知错误码使用默认状态码', () => {
      const error = new PaymentError('UNKNOWN_CODE', '未知错误');

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('ValidationError 处理', () => {
    test('应该正确处理验证错误', () => {
      const error = new Error('验证失败');
      error.name = 'ValidationError';

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: '参数验证失败',
          userMessage: '请检查输入参数',
          details: '验证失败'
        }
      });
    });
  });

  describe('JSON 解析错误处理', () => {
    test('应该正确处理 JSON 语法错误', () => {
      const error = new SyntaxError('Unexpected token');
      error.status = 400;
      error.body = {};

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: '请求数据格式错误',
          userMessage: '请求格式不正确',
          details: 'Invalid JSON format'
        }
      });
    });
  });

  describe('404 错误处理', () => {
    test('应该正确处理 404 错误', () => {
      const error = new Error('Not Found');
      error.status = 404;

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: ERROR_CODES.ORDER_NOT_FOUND,
          message: '请求的资源不存在',
          userMessage: '页面不存在',
          details: null
        }
      });
    });
  });

  describe('通用错误处理', () => {
    test('应该正确处理未知错误（开发环境）', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('未知错误');

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: '未知错误',
          userMessage: '系统异常，请稍后重试',
          details: expect.any(String)
        }
      });

      process.env.NODE_ENV = originalEnv;
    });

    test('应该正确处理未知错误（生产环境）', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('未知错误');

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: '系统内部错误',
          userMessage: '系统异常，请稍后重试',
          details: null
        }
      });

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('错误日志记录', () => {
    test('应该记录错误日志', () => {
      // 模拟 logger.error 方法
      const loggerErrorSpy = jest.spyOn(require('../utils/logger').logger, 'error').mockImplementation(() => {});
      const paymentLoggerSpy = jest.spyOn(require('../utils/logger').PaymentLogger, 'logPaymentError').mockImplementation(() => {});
      
      const error = new PaymentError(ERROR_CODES.PAYMENT_FAILED, '支付失败');

      errorHandler(error, req, res, next);

      expect(loggerErrorSpy).toHaveBeenCalledWith('HTTP 请求错误', expect.objectContaining({
        url: '/test',
        method: 'GET',
        ip: '127.0.0.1',
        userAgent: 'test-user-agent',
        error: expect.objectContaining({
          name: 'PaymentError',
          message: '支付失败',
          code: ERROR_CODES.PAYMENT_FAILED
        })
      }));

      expect(paymentLoggerSpy).toHaveBeenCalledWith(error, expect.objectContaining({
        url: '/test',
        method: 'GET',
        ip: '127.0.0.1'
      }));

      loggerErrorSpy.mockRestore();
      paymentLoggerSpy.mockRestore();
    });
  });
});

describe('notFoundHandler 中间件', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      originalUrl: '/nonexistent'
    };
    res = {};
    next = jest.fn();
  });

  test('应该创建 404 PaymentError 并传递给下一个中间件', () => {
    notFoundHandler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(PaymentError));
    const error = next.mock.calls[0][0];
    expect(error.code).toBe(ERROR_CODES.ORDER_NOT_FOUND);
    expect(error.message).toBe('路径 /nonexistent 不存在');
    expect(error.status).toBe(404);
  });
});

describe('asyncHandler 包装器', () => {
  test('应该正确处理成功的异步函数', async () => {
    const asyncFn = jest.fn().mockResolvedValue('success');
    const wrappedFn = asyncHandler(asyncFn);
    const req = {};
    const res = {};
    const next = jest.fn();

    await wrappedFn(req, res, next);

    expect(asyncFn).toHaveBeenCalledWith(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });

  test('应该捕获异步函数的错误并传递给 next', async () => {
    const error = new Error('异步错误');
    const asyncFn = jest.fn().mockRejectedValue(error);
    const wrappedFn = asyncHandler(asyncFn);
    const req = {};
    const res = {};
    const next = jest.fn();

    await wrappedFn(req, res, next);

    expect(asyncFn).toHaveBeenCalledWith(req, res, next);
    expect(next).toHaveBeenCalledWith(error);
  });

  test('应该处理同步函数', () => {
    const syncFn = jest.fn().mockReturnValue('success');
    const wrappedFn = asyncHandler(syncFn);
    const req = {};
    const res = {};
    const next = jest.fn();

    wrappedFn(req, res, next);

    expect(syncFn).toHaveBeenCalledWith(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });
});