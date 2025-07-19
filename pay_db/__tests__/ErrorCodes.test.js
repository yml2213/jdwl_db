const { ERROR_CODES, ERROR_MESSAGES, HTTP_STATUS_CODES } = require('../errors/ErrorCodes');

describe('ErrorCodes', () => {
  describe('ERROR_CODES 常量', () => {
    test('应该包含所有必需的错误码', () => {
      const requiredCodes = [
        'INVALID_SIGNATURE',
        'PAYMENT_FAILED',
        'ORDER_NOT_FOUND',
        'INVALID_AMOUNT',
        'NETWORK_ERROR',
        'CONFIG_ERROR',
        'VALIDATION_ERROR',
        'ORDER_STATUS_ERROR',
        'CALLBACK_ERROR'
      ];

      requiredCodes.forEach(code => {
        expect(ERROR_CODES).toHaveProperty(code);
        expect(typeof ERROR_CODES[code]).toBe('string');
      });
    });

    test('错误码应该是唯一的', () => {
      const codes = Object.values(ERROR_CODES);
      const uniqueCodes = [...new Set(codes)];
      expect(codes.length).toBe(uniqueCodes.length);
    });
  });

  describe('ERROR_MESSAGES 映射', () => {
    test('每个错误码都应该有对应的错误消息', () => {
      Object.values(ERROR_CODES).forEach(code => {
        expect(ERROR_MESSAGES).toHaveProperty(code);
        expect(typeof ERROR_MESSAGES[code]).toBe('string');
        expect(ERROR_MESSAGES[code].length).toBeGreaterThan(0);
      });
    });

    test('错误消息应该是中文', () => {
      const chinesePattern = /[\u4e00-\u9fa5]/;
      Object.values(ERROR_MESSAGES).forEach(message => {
        expect(chinesePattern.test(message)).toBe(true);
      });
    });
  });

  describe('HTTP_STATUS_CODES 映射', () => {
    test('每个错误码都应该有对应的 HTTP 状态码', () => {
      Object.values(ERROR_CODES).forEach(code => {
        expect(HTTP_STATUS_CODES).toHaveProperty(code);
        expect(typeof HTTP_STATUS_CODES[code]).toBe('number');
      });
    });

    test('HTTP 状态码应该在有效范围内', () => {
      Object.values(HTTP_STATUS_CODES).forEach(statusCode => {
        expect(statusCode).toBeGreaterThanOrEqual(400);
        expect(statusCode).toBeLessThan(600);
      });
    });

    test('特定错误应该映射到正确的 HTTP 状态码', () => {
      expect(HTTP_STATUS_CODES[ERROR_CODES.INVALID_SIGNATURE]).toBe(400);
      expect(HTTP_STATUS_CODES[ERROR_CODES.ORDER_NOT_FOUND]).toBe(404);
      expect(HTTP_STATUS_CODES[ERROR_CODES.NETWORK_ERROR]).toBe(503);
      expect(HTTP_STATUS_CODES[ERROR_CODES.INTERNAL_ERROR]).toBe(500);
    });
  });

  describe('数据一致性', () => {
    test('ERROR_CODES、ERROR_MESSAGES 和 HTTP_STATUS_CODES 应该包含相同的键', () => {
      const errorCodes = Object.values(ERROR_CODES);
      const messageKeys = Object.keys(ERROR_MESSAGES);
      const statusKeys = Object.keys(HTTP_STATUS_CODES);

      expect(errorCodes.sort()).toEqual(messageKeys.sort());
      expect(errorCodes.sort()).toEqual(statusKeys.sort());
    });
  });
});