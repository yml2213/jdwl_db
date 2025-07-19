const crypto = require('crypto');
const fs = require('fs');

/**
 * 签名服务类 - 处理支付宝接口的签名生成和验证
 */
class SignatureService {
  /**
   * 生成 RSA2 签名
   * @param {Object} params - 需要签名的参数对象
   * @param {string} privateKeyPath - 私钥文件路径
   * @returns {string} 生成的签名
   */
  generateSignature(params, privateKeyPath) {
    try {
      // 读取私钥文件
      const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
      
      // 排序并拼接参数
      const sortedString = this.sortAndConcatParams(params);
      
      // 使用 RSA-SHA256 算法生成签名
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(sortedString, 'utf8');
      
      // 生成签名并转换为 base64 格式
      const signature = sign.sign(privateKey, 'base64');
      
      return signature;
    } catch (error) {
      throw new Error(`签名生成失败: ${error.message}`);
    }
  }

  /**
   * 验证 RSA2 签名
   * @param {Object} params - 需要验证的参数对象
   * @param {string} signature - 待验证的签名
   * @param {string} publicKeyPath - 公钥文件路径
   * @returns {boolean} 签名验证结果
   */
  verifySignature(params, signature, publicKeyPath) {
    try {
      // 读取公钥文件
      const publicKey = fs.readFileSync(publicKeyPath, 'utf8');
      
      // 排序并拼接参数
      const sortedString = this.sortAndConcatParams(params);
      
      console.log('--- 签名验证开始 ---');
      console.log('待验签字符串:', sortedString);
      console.log('支付宝返回的签名:', signature);
      // console.log('使用的支付宝公钥:', publicKey);

      // 使用 RSA-SHA256 算法验证签名
      const verify = crypto.createVerify('RSA-SHA256');
      verify.update(sortedString, 'utf8');
      
      // 验证签名
      const isValid = verify.verify(publicKey, signature, 'base64');
      
      console.log('验签结果:', isValid);
      console.log('--- 签名验证结束 ---');

      return isValid;
    } catch (error) {
      // 记录错误但不抛出，返回验证失败
      console.error(`签名验证失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 验证支付宝回调签名
   * @param {Object} callbackParams - 支付宝回调参数
   * @param {string} alipayPublicKeyPath - 支付宝公钥文件路径
   * @returns {Object} 验证结果对象 { isValid: boolean, error?: string }
   */
  verifyAlipayCallback(callbackParams, alipayPublicKeyPath) {
    try {
      // 检查必要参数
      if (!callbackParams || typeof callbackParams !== 'object') {
        return {
          isValid: false,
          error: '回调参数无效'
        };
      }

      // 检查是否包含签名
      if (!callbackParams.sign) {
        return {
          isValid: false,
          error: '缺少签名参数'
        };
      }

      // 准备待验签参数
      const paramsToVerify = { ...callbackParams };
      delete paramsToVerify.sign;
      delete paramsToVerify.sign_type; // 支付宝同步回调会包含 sign_type，需要排除

      // 验证签名
      const isValid = this.verifySignature(paramsToVerify, callbackParams.sign, alipayPublicKeyPath);
      
      if (!isValid) {
        return {
          isValid: false,
          error: '签名验证失败'
        };
      }

      return {
        isValid: true
      };
    } catch (error) {
      return {
        isValid: false,
        error: `回调验证异常: ${error.message}`
      };
    }
  }

  /**
   * 参数排序和拼接
   * @param {Object} params - 参数对象
   * @returns {string} 排序后拼接的参数字符串
   */
  sortAndConcatParams(params) {
    // 过滤掉空值和 sign 参数
    const filteredParams = {};
    for (const key in params) {
      if (params[key] !== '' && params[key] !== null && params[key] !== undefined && key !== 'sign') {
        filteredParams[key] = params[key];
      }
    }

    // 按照参数名进行字典序排序
    const sortedKeys = Object.keys(filteredParams).sort();
    
    // 拼接参数
    const paramPairs = sortedKeys.map(key => {
            return `${key}=${filteredParams[key]}`;
    });
    
    return paramPairs.join('&');
  }
}

module.exports = SignatureService;