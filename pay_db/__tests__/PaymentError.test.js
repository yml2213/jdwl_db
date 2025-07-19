const PaymentError = require('../errors/PaymentError');
const { ERROR_CODES } = require('../errors/ErrorCodes');

describe('PaymentError', () => {
  describe('构造函数', () => {
    test('应该正确创建 PaymentError 实例', () => {
      const error = new PaymentError(
        ERROR_CODES.INVALID_SIGNATURE,
        '签名验证失败',
        { signature: 'invalid' }
      );

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(PaymentError);
      expect(error.name).toBe('PaymentError');
      expect(error.code).toBe(ERROR_CODES.INVALID_SIGNATURE);
      expect(error.message).toBe('签名验证失败');
      expect(error.details).toEqual({ signature: 'invalid' });
    });

    test('应该在没有 details 参数时正确创建实例', () => {
      const error = new PaymentError(
        ERROR_CODES.PAYMENT_FAILED,
        '支付失败'
      );

      expect(error.code).toBe(ERROR_CODES.PAYMENT_FAILED);
      expect(error.message).toBe('支付失败');
      expect(error.details).toBeNull();
    });
  });

  describe('toJSON 方法', () => {
    test('应该返回正确的 JSON 格式', () => {
      const error = new PaymentError(
        ERROR_CODES.ORDER_NOT_FOUND,
        '订单不存在',
        { orderId: '123' }
      );

      const json = error.toJSON();

      expect(json).toHaveProperty('name', 'PaymentError');
      expect(json).toHaveProperty('code', ERROR_CODES.ORDER_NOT_FOUND);
      expect(json).toHaveProperty('message', '订单不存在');
      expect(json).toHaveProperty('details', { orderId: '123' });
      expect(json).toHaveProperty('stack');
      expect(typeof json.stack).toBe('string');
    });
  });

  describe('getUserMessage 方法', () => {
    test('应该返回已知错误码的用户友好消息', () => {
      const error = new PaymentError(ERROR_CODES.INVALID_SIGNATURE, '签名验证失败');
      expect(error.getUserMessage()).toBe('签名验证失败，请稍后重试');
    });

    test('应该返回支付失败的用户友好消息', () => {
      const error = new PaymentError(ERROR_CODES.PAYMENT_FAILED, '支付处理失败');
      expect(error.getUserMessage()).toBe('支付失败，请重新尝试');
    });

    test('应该返回订单不存在的用户友好消息', () => {
      const error = new PaymentError(ERROR_CODES.ORDER_NOT_FOUND, '订单不存在');
      expect(error.getUserMessage()).toBe('订单不存在');
    });

    test('应该返回网络错误的用户友好消息', () => {
      const error = new PaymentError(ERROR_CODES.NETWORK_ERROR, '网络连接失败');
      expect(error.getUserMessage()).toBe('网络连接异常，请稍后重试');
    });

    test('应该为未知错误码返回默认消息', () => {
      const error = new PaymentError('UNKNOWN_CODE', '未知错误');
      expect(error.getUserMessage()).toBe('系统异常，请联系客服');
    });
  });

  describe('错误堆栈', () => {
    test('应该包含正确的错误堆栈信息', () => {
      const error = new PaymentError(ERROR_CODES.INTERNAL_ERROR, '内部错误');
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('PaymentError');
      expect(error.stack).toContain('内部错误');
    });
  });
});