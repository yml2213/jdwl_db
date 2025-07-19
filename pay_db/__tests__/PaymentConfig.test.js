const fs = require('fs');
const path = require('path');
const PaymentConfig = require('../config/PaymentConfig');

// Mock fs module
jest.mock('fs');

describe('PaymentConfig', () => {
  // Store original environment variables
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules and clear all mocks
    jest.resetModules();
    jest.clearAllMocks();
    
    // Reset environment variables
    process.env = { ...originalEnv };
    
    // Set up default environment variables for tests
    process.env.ALIPAY_APP_ID = 'test_app_id';
    process.env.ALIPAY_PRIVATE_KEY_PATH = './keys/app_private_key.pem';
    process.env.ALIPAY_PUBLIC_KEY_PATH = './keys/alipay_public_key.pem';
    process.env.NOTIFY_URL = 'http://localhost:3000/alipay/notify';
    process.env.RETURN_URL = 'http://localhost:3000/alipay/return';
    
    // Mock file system operations
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockImplementation((filePath) => {
      if (filePath.includes('private_key')) {
        return 'mock_private_key_content';
      }
      if (filePath.includes('public_key')) {
        return 'mock_public_key_content';
      }
      return 'mock_file_content';
    });
  });

  afterEach(() => {
    // Restore original environment variables
    process.env = originalEnv;
  });

  describe('Constructor and Environment Setup', () => {
    test('should create PaymentConfig with default sandbox environment', () => {
      const config = new PaymentConfig();
      expect(config.getEnvironment()).toBe('sandbox');
      expect(config.isSandbox()).toBe(true);
      expect(config.isProduction()).toBe(false);
    });

    test('should create PaymentConfig with specified environment', () => {
      const config = new PaymentConfig('production');
      expect(config.getEnvironment()).toBe('production');
      expect(config.isSandbox()).toBe(false);
      expect(config.isProduction()).toBe(true);
    });

    test('should use PAYMENT_ENV environment variable when no parameter provided', () => {
      process.env.PAYMENT_ENV = 'production';
      const config = new PaymentConfig();
      expect(config.getEnvironment()).toBe('production');
    });

    test('should throw error for invalid environment', () => {
      expect(() => {
        new PaymentConfig('invalid_env');
      }).toThrow('Invalid payment environment: invalid_env. Must be \'sandbox\' or \'production\'');
    });
  });

  describe('Configuration Loading and Validation', () => {
    test('should load configuration successfully with valid environment variables', () => {
      const config = new PaymentConfig();
      expect(config.getAppId()).toBe('test_app_id');
      expect(config.getNotifyUrl()).toBe('http://localhost:3000/alipay/notify');
      expect(config.getReturnUrl()).toBe('http://localhost:3000/alipay/return');
    });

    test('should throw error when required configuration is missing', () => {
      delete process.env.ALIPAY_APP_ID;
      
      expect(() => {
        new PaymentConfig();
      }).toThrow('Missing required configuration: appId');
    });

    test('should throw error when multiple required configurations are missing', () => {
      delete process.env.ALIPAY_APP_ID;
      delete process.env.ALIPAY_PRIVATE_KEY_PATH;
      
      expect(() => {
        new PaymentConfig();
      }).toThrow('Missing required configuration: appId, privateKeyPath');
    });

    test('should throw error when private key file does not exist', () => {
      fs.existsSync.mockImplementation((filePath) => {
        return !filePath.includes('private_key');
      });
      
      expect(() => {
        new PaymentConfig();
      }).toThrow('Private key file not found: ./keys/app_private_key.pem');
    });

    test('should throw error when public key file does not exist', () => {
      fs.existsSync.mockImplementation((filePath) => {
        return !filePath.includes('public_key');
      });
      
      expect(() => {
        new PaymentConfig();
      }).toThrow('Public key file not found: ./keys/alipay_public_key.pem');
    });
  });

  describe('Gateway URL Configuration', () => {
    test('should set sandbox gateway URL for sandbox environment', () => {
      const config = new PaymentConfig('sandbox');
      expect(config.getGatewayUrl()).toBe('https://openapi-sandbox.alipay.com/gateway.do');
    });

    test('should set production gateway URL for production environment', () => {
      const config = new PaymentConfig('production');
      expect(config.getGatewayUrl()).toBe('https://openapi.alipay.com/gateway.do');
    });

    test('should use custom gateway URL from environment variable for sandbox', () => {
      process.env.ALIPAY_GATEWAY_URL = 'https://custom-sandbox.alipay.com/gateway.do';
      const config = new PaymentConfig('sandbox');
      expect(config.getGatewayUrl()).toBe('https://custom-sandbox.alipay.com/gateway.do');
    });

    test('should ignore custom gateway URL for production environment', () => {
      process.env.ALIPAY_GATEWAY_URL = 'https://custom-sandbox.alipay.com/gateway.do';
      const config = new PaymentConfig('production');
      expect(config.getGatewayUrl()).toBe('https://openapi.alipay.com/gateway.do');
    });
  });

  describe('Key File Reading', () => {
    test('should read private key successfully', () => {
      const config = new PaymentConfig();
      const privateKey = config.getPrivateKey();
      expect(privateKey).toBe('mock_private_key_content');
      expect(fs.readFileSync).toHaveBeenCalledWith('./keys/app_private_key.pem', 'utf8');
    });

    test('should read Alipay public key successfully', () => {
      const config = new PaymentConfig();
      const publicKey = config.getAlipayPublicKey();
      expect(publicKey).toBe('mock_public_key_content');
      expect(fs.readFileSync).toHaveBeenCalledWith('./keys/alipay_public_key.pem', 'utf8');
    });

    test('should throw error when private key reading fails', () => {
      fs.readFileSync.mockImplementation((filePath) => {
        if (filePath.includes('private_key')) {
          throw new Error('File read error');
        }
        return 'mock_content';
      });
      
      const config = new PaymentConfig();
      expect(() => {
        config.getPrivateKey();
      }).toThrow('Failed to read private key: File read error');
    });

    test('should throw error when public key reading fails', () => {
      fs.readFileSync.mockImplementation((filePath) => {
        if (filePath.includes('public_key')) {
          throw new Error('File read error');
        }
        return 'mock_content';
      });
      
      const config = new PaymentConfig();
      expect(() => {
        config.getAlipayPublicKey();
      }).toThrow('Failed to read Alipay public key: File read error');
    });
  });

  describe('Environment Switching', () => {
    test('should switch from sandbox to production', () => {
      const config = new PaymentConfig('sandbox');
      expect(config.isSandbox()).toBe(true);
      
      config.switchEnvironment('production');
      expect(config.isProduction()).toBe(true);
      expect(config.getGatewayUrl()).toBe('https://openapi.alipay.com/gateway.do');
    });

    test('should switch from production to sandbox', () => {
      const config = new PaymentConfig('production');
      expect(config.isProduction()).toBe(true);
      
      config.switchEnvironment('sandbox');
      expect(config.isSandbox()).toBe(true);
      expect(config.getGatewayUrl()).toBe('https://openapi-sandbox.alipay.com/gateway.do');
    });

    test('should throw error when switching to invalid environment', () => {
      const config = new PaymentConfig();
      expect(() => {
        config.switchEnvironment('invalid');
      }).toThrow('Invalid environment: invalid. Must be \'sandbox\' or \'production\'');
    });

    test('should return config instance for method chaining', () => {
      const config = new PaymentConfig();
      const result = config.switchEnvironment('production');
      expect(result).toBe(config);
    });
  });

  describe('Configuration Object', () => {
    test('should return complete configuration object', () => {
      const config = new PaymentConfig('sandbox');
      const configObj = config.getConfig();
      
      expect(configObj).toEqual({
        appId: 'test_app_id',
        gatewayUrl: 'https://openapi-sandbox.alipay.com/gateway.do',
        notifyUrl: 'http://localhost:3000/alipay/notify',
        returnUrl: 'http://localhost:3000/alipay/return',
        environment: 'sandbox',
        isSandbox: true,
        isProduction: false
      });
    });

    test('should return production configuration object', () => {
      const config = new PaymentConfig('production');
      const configObj = config.getConfig();
      
      expect(configObj).toEqual({
        appId: 'test_app_id',
        gatewayUrl: 'https://openapi.alipay.com/gateway.do',
        notifyUrl: 'http://localhost:3000/alipay/notify',
        returnUrl: 'http://localhost:3000/alipay/return',
        environment: 'production',
        isSandbox: false,
        isProduction: true
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle missing callback URLs gracefully', () => {
      delete process.env.NOTIFY_URL;
      delete process.env.RETURN_URL;
      
      const config = new PaymentConfig();
      expect(config.getNotifyUrl()).toBeUndefined();
      expect(config.getReturnUrl()).toBeUndefined();
    });

    test('should handle empty environment variables', () => {
      process.env.ALIPAY_APP_ID = '';
      
      expect(() => {
        new PaymentConfig();
      }).toThrow('Missing required configuration: appId');
    });

    test('should handle whitespace-only environment variables', () => {
      process.env.ALIPAY_APP_ID = '   ';
      
      // The current implementation treats whitespace as valid, but we might want to enhance this
      const config = new PaymentConfig();
      expect(config.getAppId()).toBe('   ');
    });
  });
});