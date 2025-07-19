const SignatureService = require('../services/SignatureService');
const fs = require('fs');
const crypto = require('crypto');

describe('SignatureService', () => {
  let signatureService;
  let testPrivateKeyPath;
  let testPublicKeyPath;

  beforeAll(() => {
    signatureService = new SignatureService();
    
    // 生成测试用的 RSA 密钥对
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    // 创建临时密钥文件
    testPrivateKeyPath = '__tests__/test_private_key.pem';
    testPublicKeyPath = '__tests__/test_public_key.pem';
    
    fs.writeFileSync(testPrivateKeyPath, privateKey);
    fs.writeFileSync(testPublicKeyPath, publicKey);
  });

  afterAll(() => {
    // 清理测试文件
    if (fs.existsSync(testPrivateKeyPath)) {
      fs.unlinkSync(testPrivateKeyPath);
    }
    if (fs.existsSync(testPublicKeyPath)) {
      fs.unlinkSync(testPublicKeyPath);
    }
  });

  describe('sortAndConcatParams', () => {
    test('应该正确排序和拼接参数', () => {
      const params = {
        app_id: '2021000000000000',
        method: 'alipay.trade.page.pay',
        charset: 'utf-8',
        sign_type: 'RSA2',
        timestamp: '2023-01-01 12:00:00',
        version: '1.0'
      };

      const result = signatureService.sortAndConcatParams(params);
      const expected = 'app_id=2021000000000000&charset=utf-8&method=alipay.trade.page.pay&sign_type=RSA2&timestamp=2023-01-01 12:00:00&version=1.0';
      
      expect(result).toBe(expected);
    });

    test('应该过滤掉空值参数', () => {
      const params = {
        app_id: '2021000000000000',
        method: 'alipay.trade.page.pay',
        empty_string: '',
        null_value: null,
        undefined_value: undefined,
        charset: 'utf-8'
      };

      const result = signatureService.sortAndConcatParams(params);
      const expected = 'app_id=2021000000000000&charset=utf-8&method=alipay.trade.page.pay';
      
      expect(result).toBe(expected);
    });

    test('应该过滤掉 sign 参数', () => {
      const params = {
        app_id: '2021000000000000',
        method: 'alipay.trade.page.pay',
        sign: 'existing_signature',
        charset: 'utf-8'
      };

      const result = signatureService.sortAndConcatParams(params);
      const expected = 'app_id=2021000000000000&charset=utf-8&method=alipay.trade.page.pay';
      
      expect(result).toBe(expected);
    });

    test('应该处理包含特殊字符的参数值', () => {
      const params = {
        subject: '测试订单&商品',
        body: '订单描述=详情',
        app_id: '2021000000000000'
      };

      const result = signatureService.sortAndConcatParams(params);
      const expected = 'app_id=2021000000000000&body=订单描述=详情&subject=测试订单&商品';
      
      expect(result).toBe(expected);
    });
  });

  describe('generateSignature', () => {
    test('应该成功生成 RSA2 签名', () => {
      const params = {
        app_id: '2021000000000000',
        method: 'alipay.trade.page.pay',
        charset: 'utf-8',
        sign_type: 'RSA2',
        timestamp: '2023-01-01 12:00:00',
        version: '1.0'
      };

      const signature = signatureService.generateSignature(params, testPrivateKeyPath);
      
      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature.length).toBeGreaterThan(0);
      
      // 验证签名是有效的 base64 字符串
      expect(() => Buffer.from(signature, 'base64')).not.toThrow();
    });

    test('应该为相同参数生成相同的签名', () => {
      const params = {
        app_id: '2021000000000000',
        method: 'alipay.trade.page.pay',
        charset: 'utf-8'
      };

      const signature1 = signatureService.generateSignature(params, testPrivateKeyPath);
      const signature2 = signatureService.generateSignature(params, testPrivateKeyPath);
      
      expect(signature1).toBe(signature2);
    });

    test('应该为不同参数生成不同的签名', () => {
      const params1 = {
        app_id: '2021000000000000',
        method: 'alipay.trade.page.pay'
      };

      const params2 = {
        app_id: '2021000000000001',
        method: 'alipay.trade.page.pay'
      };

      const signature1 = signatureService.generateSignature(params1, testPrivateKeyPath);
      const signature2 = signatureService.generateSignature(params2, testPrivateKeyPath);
      
      expect(signature1).not.toBe(signature2);
    });

    test('当私钥文件不存在时应该抛出错误', () => {
      const params = {
        app_id: '2021000000000000',
        method: 'alipay.trade.page.pay'
      };

      expect(() => {
        signatureService.generateSignature(params, 'non_existent_key.pem');
      }).toThrow('签名生成失败');
    });

    test('当私钥格式无效时应该抛出错误', () => {
      const invalidKeyPath = '__tests__/invalid_key.pem';
      fs.writeFileSync(invalidKeyPath, 'invalid key content');

      const params = {
        app_id: '2021000000000000',
        method: 'alipay.trade.page.pay'
      };

      expect(() => {
        signatureService.generateSignature(params, invalidKeyPath);
      }).toThrow('签名生成失败');

      // 清理测试文件
      fs.unlinkSync(invalidKeyPath);
    });
  });

  describe('verifySignature', () => {
    test('应该成功验证有效的签名', () => {
      const params = {
        app_id: '2021000000000000',
        method: 'alipay.trade.page.pay',
        charset: 'utf-8',
        timestamp: '2023-01-01 12:00:00'
      };

      // 生成签名
      const signature = signatureService.generateSignature(params, testPrivateKeyPath);
      
      // 验证签名
      const isValid = signatureService.verifySignature(params, signature, testPublicKeyPath);
      
      expect(isValid).toBe(true);
    });

    test('应该拒绝无效的签名', () => {
      const params = {
        app_id: '2021000000000000',
        method: 'alipay.trade.page.pay',
        charset: 'utf-8'
      };

      const invalidSignature = 'invalid_signature_string';
      
      const isValid = signatureService.verifySignature(params, invalidSignature, testPublicKeyPath);
      
      expect(isValid).toBe(false);
    });

    test('应该拒绝被篡改的参数', () => {
      const originalParams = {
        app_id: '2021000000000000',
        method: 'alipay.trade.page.pay',
        total_amount: '100.00'
      };

      // 生成原始签名
      const signature = signatureService.generateSignature(originalParams, testPrivateKeyPath);
      
      // 篡改参数
      const tamperedParams = {
        ...originalParams,
        total_amount: '999.99'
      };
      
      // 验证篡改后的参数
      const isValid = signatureService.verifySignature(tamperedParams, signature, testPublicKeyPath);
      
      expect(isValid).toBe(false);
    });

    test('当公钥文件不存在时应该返回 false', () => {
      const params = {
        app_id: '2021000000000000',
        method: 'alipay.trade.page.pay'
      };

      const signature = signatureService.generateSignature(params, testPrivateKeyPath);
      
      const isValid = signatureService.verifySignature(params, signature, 'non_existent_key.pem');
      
      expect(isValid).toBe(false);
    });

    test('当公钥格式无效时应该返回 false', () => {
      const invalidKeyPath = '__tests__/invalid_public_key.pem';
      fs.writeFileSync(invalidKeyPath, 'invalid key content');

      const params = {
        app_id: '2021000000000000',
        method: 'alipay.trade.page.pay'
      };

      const signature = signatureService.generateSignature(params, testPrivateKeyPath);
      
      const isValid = signatureService.verifySignature(params, signature, invalidKeyPath);
      
      expect(isValid).toBe(false);

      // 清理测试文件
      fs.unlinkSync(invalidKeyPath);
    });
  });

  describe('verifyAlipayCallback', () => {
    test('应该成功验证有效的支付宝回调', () => {
      const callbackParams = {
        app_id: '2021000000000000',
        trade_no: '2023010122001234567890123456',
        out_trade_no: 'ORDER_20230101_001',
        trade_status: 'TRADE_SUCCESS',
        total_amount: '100.00'
      };

      // 生成签名
      const signature = signatureService.generateSignature(callbackParams, testPrivateKeyPath);
      callbackParams.sign = signature;

      const result = signatureService.verifyAlipayCallback(callbackParams, testPublicKeyPath);
      
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('应该拒绝缺少签名的回调', () => {
      const callbackParams = {
        app_id: '2021000000000000',
        trade_no: '2023010122001234567890123456',
        out_trade_no: 'ORDER_20230101_001'
      };

      const result = signatureService.verifyAlipayCallback(callbackParams, testPublicKeyPath);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('缺少签名参数');
    });

    test('应该拒绝无效的回调参数', () => {
      const result1 = signatureService.verifyAlipayCallback(null, testPublicKeyPath);
      expect(result1.isValid).toBe(false);
      expect(result1.error).toBe('回调参数无效');

      const result2 = signatureService.verifyAlipayCallback('invalid', testPublicKeyPath);
      expect(result2.isValid).toBe(false);
      expect(result2.error).toBe('回调参数无效');
    });

    test('应该拒绝签名验证失败的回调', () => {
      const callbackParams = {
        app_id: '2021000000000000',
        trade_no: '2023010122001234567890123456',
        out_trade_no: 'ORDER_20230101_001',
        trade_status: 'TRADE_SUCCESS',
        total_amount: '100.00',
        sign: 'invalid_signature'
      };

      const result = signatureService.verifyAlipayCallback(callbackParams, testPublicKeyPath);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('签名验证失败');
    });

    test('应该处理公钥文件不存在的异常', () => {
      const callbackParams = {
        app_id: '2021000000000000',
        trade_no: '2023010122001234567890123456',
        sign: 'some_signature'
      };

      const result = signatureService.verifyAlipayCallback(callbackParams, 'non_existent_key.pem');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('签名验证失败');
    });
  });

  describe('生成的签名验证', () => {
    test('生成的签名应该能够通过公钥验证', () => {
      const params = {
        app_id: '2021000000000000',
        method: 'alipay.trade.page.pay',
        charset: 'utf-8',
        timestamp: '2023-01-01 12:00:00'
      };

      // 生成签名
      const signature = signatureService.generateSignature(params, testPrivateKeyPath);
      
      // 使用公钥验证签名
      const publicKey = fs.readFileSync(testPublicKeyPath, 'utf8');
      const sortedString = signatureService.sortAndConcatParams(params);
      
      const verify = crypto.createVerify('RSA-SHA256');
      verify.update(sortedString, 'utf8');
      const isValid = verify.verify(publicKey, signature, 'base64');
      
      expect(isValid).toBe(true);
    });
  });

  describe('错误处理和边界情况', () => {
    test('应该正确处理包含 sign 参数的验证', () => {
      const params = {
        app_id: '2021000000000000',
        method: 'alipay.trade.page.pay',
        charset: 'utf-8'
      };

      // 生成签名
      const signature = signatureService.generateSignature(params, testPrivateKeyPath);
      
      // 添加 sign 参数到验证参数中
      const paramsWithSign = {
        ...params,
        sign: signature
      };
      
      // 验证时应该忽略 sign 参数
      const isValid = signatureService.verifySignature(paramsWithSign, signature, testPublicKeyPath);
      
      expect(isValid).toBe(true);
    });

    test('应该正确处理空字符串和 null 值', () => {
      const params = {
        app_id: '2021000000000000',
        method: 'alipay.trade.page.pay',
        empty_param: '',
        null_param: null,
        undefined_param: undefined,
        valid_param: 'value'
      };

      // 生成签名
      const signature = signatureService.generateSignature(params, testPrivateKeyPath);
      
      // 验证签名
      const isValid = signatureService.verifySignature(params, signature, testPublicKeyPath);
      
      expect(isValid).toBe(true);
    });
  });
});