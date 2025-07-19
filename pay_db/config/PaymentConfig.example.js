/**
 * PaymentConfig 使用示例
 * 演示如何使用 PaymentConfig 类进行支付配置管理
 */

const PaymentConfig = require('./PaymentConfig');

// 示例：创建沙箱环境配置
console.log('=== 沙箱环境配置示例 ===');
try {
  const sandboxConfig = new PaymentConfig('sandbox');
  
  console.log('环境:', sandboxConfig.getEnvironment());
  console.log('是否沙箱:', sandboxConfig.isSandbox());
  console.log('网关地址:', sandboxConfig.getGatewayUrl());
  console.log('应用ID:', sandboxConfig.getAppId());
  console.log('通知地址:', sandboxConfig.getNotifyUrl());
  console.log('返回地址:', sandboxConfig.getReturnUrl());
  
  console.log('\n完整配置对象:');
  console.log(JSON.stringify(sandboxConfig.getConfig(), null, 2));
  
} catch (error) {
  console.error('沙箱配置创建失败:', error.message);
}

// 示例：创建生产环境配置
console.log('\n=== 生产环境配置示例 ===');
try {
  const productionConfig = new PaymentConfig('production');
  
  console.log('环境:', productionConfig.getEnvironment());
  console.log('是否生产环境:', productionConfig.isProduction());
  console.log('网关地址:', productionConfig.getGatewayUrl());
  
} catch (error) {
  console.error('生产配置创建失败:', error.message);
}

// 示例：环境切换
console.log('\n=== 环境切换示例 ===');
try {
  const config = new PaymentConfig('sandbox');
  console.log('初始环境:', config.getEnvironment());
  console.log('初始网关:', config.getGatewayUrl());
  
  // 切换到生产环境
  config.switchEnvironment('production');
  console.log('切换后环境:', config.getEnvironment());
  console.log('切换后网关:', config.getGatewayUrl());
  
} catch (error) {
  console.error('环境切换失败:', error.message);
}

// 示例：使用默认环境（从环境变量读取）
console.log('\n=== 默认环境配置示例 ===');
try {
  const defaultConfig = new PaymentConfig();
  console.log('默认环境:', defaultConfig.getEnvironment());
  console.log('默认网关:', defaultConfig.getGatewayUrl());
  
} catch (error) {
  console.error('默认配置创建失败:', error.message);
}