const PaymentConfig = require('../config/PaymentConfig');
const SignatureService = require('./SignatureService');
const OrderManager = require('./OrderManager');
const UserSubscriptionService = require('./UserSubscriptionService');
const { Order, ORDER_STATUS } = require('../models/Order');

/**
 * 支付服务类 - 核心支付业务逻辑处理
 */
class PaymentService {
  constructor(environment = null) {
    this.config = new PaymentConfig(environment);
    this.signatureService = new SignatureService();
    this.orderManager = new OrderManager();
    this.userSubscriptionService = new UserSubscriptionService();
    this.initialized = false;
  }

  /**
   * 初始化支付服务
   */
  async initialize() {
    if (this.initialized) return;
    
    await this.orderManager.initialize();
    this.initialized = true;
  }

  /**
   * 创建支付订单
   * @param {Object} orderInfo - 订单信息
   * @param {string} orderInfo.outTradeNo - 商户订单号
   * @param {string} orderInfo.subject - 订单标题
   * @param {number} orderInfo.totalAmount - 支付金额
   * @param {string} [orderInfo.body] - 订单描述
   * @returns {Promise<Order>} 创建的订单对象
   */
  async createPayment(orderInfo) {
    try {
      // 确保服务已初始化
      await this.initialize();

      // 验证订单信息
      this._validateOrderInfo(orderInfo);

      // 检查商户订单号是否已存在
      const existingOrder = await this.orderManager.getOrderByOutTradeNo(orderInfo.outTradeNo);
      if (existingOrder) {
        throw new Error(`订单号 ${orderInfo.outTradeNo} 已存在`);
      }

      // 构建订单数据
      const orderData = {
        outTradeNo: orderInfo.outTradeNo,
        subject: orderInfo.subject,
        totalAmount: orderInfo.totalAmount,
        body: orderInfo.body || orderInfo.subject,
        status: ORDER_STATUS.PENDING
      };

      // 创建订单
      const order = await this.orderManager.createOrder(orderData);

      console.log(`支付订单创建成功: ${order.id}, 商户订单号: ${order.outTradeNo}`);
      
      return order;
    } catch (error) {
      console.error('创建支付订单失败:', error.message);
      throw new Error(`创建支付订单失败: ${error.message}`);
    }
  }

  /**
   * 验证订单信息
   * @param {Object} orderInfo - 订单信息
   * @private
   */
  _validateOrderInfo(orderInfo) {
    const errors = [];

    // 验证必填字段
    if (!orderInfo.outTradeNo || typeof orderInfo.outTradeNo !== 'string') {
      errors.push('商户订单号(outTradeNo)是必填项且必须为字符串');
    }

    if (!orderInfo.subject || typeof orderInfo.subject !== 'string') {
      errors.push('订单标题(subject)是必填项且必须为字符串');
    }

    if (!orderInfo.totalAmount || typeof orderInfo.totalAmount !== 'number' || orderInfo.totalAmount <= 0) {
      errors.push('支付金额(totalAmount)是必填项且必须为正数');
    }

    // 验证商户订单号格式
    if (orderInfo.outTradeNo && !/^[a-zA-Z0-9_]{6,64}$/.test(orderInfo.outTradeNo)) {
      errors.push('商户订单号格式无效，必须为6-64位字母数字下划线组合');
    }

    // 验证金额范围和精度
    if (orderInfo.totalAmount) {
      if (orderInfo.totalAmount < 0.01 || orderInfo.totalAmount > 100000) {
        errors.push('支付金额必须在0.01-100000之间');
      }
      
      if (!Number.isInteger(orderInfo.totalAmount * 100)) {
        errors.push('支付金额最多支持两位小数');
      }
    }

    // 验证订单标题长度
    if (orderInfo.subject && orderInfo.subject.length > 256) {
      errors.push('订单标题长度不能超过256个字符');
    }

    // 验证订单描述长度
    if (orderInfo.body && orderInfo.body.length > 400) {
      errors.push('订单描述长度不能超过400个字符');
    }

    if (errors.length > 0) {
      throw new Error(`订单信息验证失败: ${errors.join('; ')}`);
    }
  }

  /**
   * 根据订单ID获取订单
   * @param {string} orderId - 订单ID
   * @returns {Promise<Order|null>} 订单对象
   */
  async getOrder(orderId) {
    await this.initialize();
    return await this.orderManager.getOrder(orderId);
  }

  /**
   * 根据商户订单号获取订单
   * @param {string} outTradeNo - 商户订单号
   * @returns {Promise<Order|null>} 订单对象
   */
  async getOrderByOutTradeNo(outTradeNo) {
    await this.initialize();
    return await this.orderManager.getOrderByOutTradeNo(outTradeNo);
  }

  /**
   * 生成支付URL
   * @param {Object} orderInfo - 订单信息
   * @param {string} orderInfo.outTradeNo - 商户订单号
   * @param {string} orderInfo.subject - 订单标题
   * @param {number} orderInfo.totalAmount - 支付金额
   * @param {string} [orderInfo.body] - 订单描述
   * @returns {Promise<string>} 支付URL
   */
  async generatePaymentUrl(orderInfo, req) {
    try {
      // 确保服务已初始化
      await this.initialize();

      // 验证订单信息
      this._validateOrderInfo(orderInfo);

      // 构建支付参数
      const paymentParams = this._buildPaymentParams(orderInfo, req);

      // 生成签名
      const signature = this.signatureService.generateSignature(
        paymentParams, 
        this.config.privateKeyPath
      );

      // 构建完整的支付URL
      const paymentUrl = this._buildPaymentUrl(paymentParams, signature);

      console.log(`支付URL生成成功，订单号: ${orderInfo.outTradeNo}`);
      
      return paymentUrl;
    } catch (error) {
      console.error('生成支付URL失败:', error.message);
      throw new Error(`生成支付URL失败: ${error.message}`);
    }
  }

  /**
   * 构建支付参数
   * @param {Object} orderInfo - 订单信息
   * @returns {Object} 支付参数
   * @private
   */
  _buildPaymentParams(orderInfo, req) {
    const timestamp = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    
    // 构建业务参数
    const bizContent = {
      out_trade_no: orderInfo.outTradeNo,
      product_code: 'FAST_INSTANT_TRADE_PAY',
      total_amount: orderInfo.totalAmount.toFixed(2),
      subject: orderInfo.subject,
      body: orderInfo.body || orderInfo.subject,
      timeout_express: '30m' // 30分钟超时
    };

    // 构建请求参数
    const params = {
      app_id: this.config.getAppId(),
      method: 'alipay.trade.page.pay',
      charset: 'utf-8',
      sign_type: 'RSA2',
      timestamp: timestamp,
      version: '1.0',
      biz_content: JSON.stringify(bizContent)
    };

    // 添加回调地址（如果配置了）
    if (this.config.getNotifyUrl()) {
      params.notify_url = this.config.getNotifyUrl();
    } else if (req) {
      params.notify_url = `${req.protocol}://${req.get('host')}/alipay/notify`;
    }

    if (this.config.getReturnUrl()) {
      params.return_url = this.config.getReturnUrl();
    } else if (req) {
      params.return_url = `${req.protocol}://${req.get('host')}/alipay/return`;
    }

    return params;
  }

  /**
   * 构建支付URL
   * @param {Object} params - 支付参数
   * @param {string} signature - 签名
   * @returns {string} 完整的支付URL
   * @private
   */
  _buildPaymentUrl(params, signature) {
    // 添加签名到参数中
    const allParams = {
      ...params,
      sign: signature
    };

    // 构建查询字符串
    const queryString = Object.keys(allParams)
      .sort()
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(allParams[key])}`)
      .join('&');

    // 返回完整的支付URL
    return `${this.config.getGatewayUrl()}?${queryString}`;
  }

  /**
   * 创建支付订单并生成支付URL
   * @param {Object} orderInfo - 订单信息
   * @returns {Promise<{order: Order, paymentUrl: string}>} 订单和支付URL
   */
  async createPaymentAndGenerateUrl(orderInfo, req) {
    try {
      // 创建订单
      const order = await this.createPayment(orderInfo);

      // 生成支付URL
      const paymentUrl = await this.generatePaymentUrl(orderInfo, req);

      return {
        order,
        paymentUrl
      };
    } catch (error) {
      console.error('创建支付订单并生成URL失败:', error.message);
      throw error;
    }
  }

  /**
   * 处理支付宝异步通知回调
   * @param {Object} notifyData - 支付宝异步通知数据
   * @returns {Promise<{success: boolean, message: string, order?: Order}>} 处理结果
   */
  async handleNotifyCallback(notifyData) {
    try {
      // 确保服务已初始化
      await this.initialize();

      console.log('收到支付宝异步通知:', JSON.stringify(notifyData, null, 2));

      // 验证回调数据
      const validationResult = this._validateCallbackData(notifyData);
      if (!validationResult.isValid) {
        console.error('异步通知验证失败:', validationResult.error);
        return {
          success: false,
          message: validationResult.error
        };
      }

      // 验证签名
      const signatureResult = this.signatureService.verifyAlipayCallback(
        notifyData, 
        this.config.publicKeyPath
      );
      
      if (!signatureResult.isValid) {
        console.error('异步通知签名验证失败:', signatureResult.error);
        return {
          success: false,
          message: `签名验证失败: ${signatureResult.error}`
        };
      }

      // 根据商户订单号查找订单
      const order = await this.orderManager.getOrderByOutTradeNo(notifyData.out_trade_no);
      if (!order) {
        console.error('订单不存在:', notifyData.out_trade_no);
        return {
          success: false,
          message: `订单不存在: ${notifyData.out_trade_no}`
        };
      }

      // 处理支付状态
      const updateResult = await this._updateOrderFromNotify(order, notifyData);
      
      console.log(`异步通知处理完成，订单: ${order.outTradeNo}, 状态: ${order.status}`);
      
      return {
        success: true,
        message: '异步通知处理成功',
        order: updateResult
      };
    } catch (error) {
      console.error('处理异步通知失败:', error.message);
      return {
        success: false,
        message: `处理异步通知失败: ${error.message}`
      };
    }
  }

  /**
   * 处理支付宝同步返回回调
   * @param {Object} returnData - 支付宝同步返回数据
   * @returns {Promise<{success: boolean, message: string, order?: Order}>} 处理结果
   */
  async handleReturnCallback(returnData) {
    try {
      // 确保服务已初始化
      await this.initialize();

      console.log('收到支付宝同步返回:', JSON.stringify(returnData, null, 2));

      // 验证回调数据
      const validationResult = this._validateCallbackData(returnData, 'return');
      if (!validationResult.isValid) {
        console.error('同步返回验证失败:', validationResult.error);
        return {
          success: false,
          message: validationResult.error
        };
      }

      // 验证签名（沙箱环境暂时跳过签名验证）
      if (this.config.isProduction()) {
        const signatureResult = this.signatureService.verifyAlipayCallback(
          returnData, 
          this.config.publicKeyPath
        );
        
        if (!signatureResult.isValid) {
          console.error('同步返回签名验证失败:', signatureResult.error);
          return {
            success: false,
            message: `签名验证失败: ${signatureResult.error}`
          };
        }
      } else {
        console.log('沙箱环境：跳过签名验证');
      }

      // 根据商户订单号查找订单
      const order = await this.orderManager.getOrderByOutTradeNo(returnData.out_trade_no);
      if (!order) {
        console.error('订单不存在:', returnData.out_trade_no);
        return {
          success: false,
          message: `订单不存在: ${returnData.out_trade_no}`
        };
      }

      // 沙箱环境：如果用户从支付宝页面返回，假设支付成功，更新订单状态
      if (!this.config.isProduction() && order.status === ORDER_STATUS.PENDING) {
        // 模拟异步通知数据
        const mockNotifyData = {
          out_trade_no: returnData.out_trade_no,
          trade_no: returnData.trade_no,
          trade_status: 'TRADE_SUCCESS',
          total_amount: returnData.total_amount,
          buyer_logon_id: 'sandbox_buyer@example.com'
        };
        
        console.log('沙箱环境：模拟支付成功，更新订单状态');
        await this._updateOrderFromNotify(order, mockNotifyData);
        
        // 重新获取更新后的订单
        const updatedOrder = await this.orderManager.getOrder(order.id);
        
        console.log(`同步返回处理完成，订单: ${updatedOrder.outTradeNo}, 状态: ${updatedOrder.status}`);
        
        return {
          success: true,
          message: '同步返回处理成功',
          order: updatedOrder
        };
      }

      // 同步返回主要用于页面跳转，不更新订单状态（以异步通知为准）
      console.log(`同步返回处理完成，订单: ${order.outTradeNo}, 当前状态: ${order.status}`);
      
      return {
        success: true,
        message: '同步返回处理成功',
        order: order
      };
    } catch (error) {
      console.error('处理同步返回失败:', error.message);
      return {
        success: false,
        message: `处理同步返回失败: ${error.message}`
      };
    }
  }

  /**
   * 查询支付状态
   * @param {string} outTradeNo - 商户订单号
   * @returns {Promise<{success: boolean, order?: Order, message?: string}>} 查询结果
   */
  async queryPaymentStatus(outTradeNo) {
    try {
      // 确保服务已初始化
      await this.initialize();

      const order = await this.orderManager.getOrderByOutTradeNo(outTradeNo);
      if (!order) {
        return {
          success: false,
          message: `订单不存在: ${outTradeNo}`
        };
      }

      return {
        success: true,
        order: order
      };
    } catch (error) {
      console.error('查询支付状态失败:', error.message);
      return {
        success: false,
        message: `查询支付状态失败: ${error.message}`
      };
    }
  }

  /**
   * 验证回调数据
   * @param {Object} callbackData - 回调数据
   * @param {string} callbackType - 回调类型 ('notify' 或 'return')
   * @returns {{isValid: boolean, error?: string}} 验证结果
   * @private
   */
  _validateCallbackData(callbackData, callbackType = 'notify') {
    if (!callbackData || typeof callbackData !== 'object') {
      return {
        isValid: false,
        error: '回调数据无效'
      };
    }

    // 基本必要字段
    const basicRequiredFields = ['out_trade_no', 'trade_no'];
    
    // 异步通知需要 trade_status，同步返回可能没有
    const requiredFields = callbackType === 'notify' 
      ? [...basicRequiredFields, 'trade_status']
      : basicRequiredFields;
    
    const missingFields = requiredFields.filter(field => !callbackData[field]);
    
    if (missingFields.length > 0) {
      return {
        isValid: false,
        error: `缺少必要字段: ${missingFields.join(', ')}`
      };
    }

    // 验证应用ID
    if (callbackData.app_id && callbackData.app_id !== this.config.getAppId()) {
      return {
        isValid: false,
        error: '应用ID不匹配'
      };
    }

    return {
      isValid: true
    };
  }

  /**
   * 根据异步通知更新订单状态
   * @param {Order} order - 订单对象
   * @param {Object} notifyData - 通知数据
   * @returns {Promise<Order>} 更新后的订单
   * @private
   */
  async _updateOrderFromNotify(order, notifyData) {
    const tradeStatus = notifyData.trade_status;
    const tradeNo = notifyData.trade_no;
    const buyerLogonId = notifyData.buyer_logon_id;

    // 更新支付宝交易信息
    await this.orderManager.updateOrderAlipayInfo(order.id, tradeNo, buyerLogonId);

    // 根据交易状态更新订单状态
    switch (tradeStatus) {
      case 'TRADE_SUCCESS':
      case 'TRADE_FINISHED':
        // 支付成功
        if (order.status === ORDER_STATUS.PENDING) {
          await this.orderManager.updateOrderStatus(order.id, ORDER_STATUS.PAID);
          console.log(`订单支付成功: ${order.outTradeNo}`);
          
          // 处理用户订阅逻辑
          await this._handleUserSubscription(order);
        }
        break;
        
      case 'TRADE_CLOSED':
        // 交易关闭
        if (order.status === ORDER_STATUS.PENDING) {
          await this.orderManager.updateOrderStatus(order.id, ORDER_STATUS.FAILED);
          console.log(`订单支付失败: ${order.outTradeNo}`);
        }
        break;
        
      case 'WAIT_BUYER_PAY':
        // 等待买家付款，保持待支付状态
        console.log(`订单等待支付: ${order.outTradeNo}`);
        break;
        
      default:
        console.warn(`未知的交易状态: ${tradeStatus}, 订单: ${order.outTradeNo}`);
        break;
    }

    // 返回更新后的订单
    return await this.orderManager.getOrder(order.id);
  }

  /**
   * 处理用户订阅逻辑
   * @param {Order} order - 订单对象
   * @returns {Promise<void>}
   * @private
   */
  async _handleUserSubscription(order) {
    try {
      // 从订单的body中提取用户信息（如果有的话）
      const userUniqueKey = this._extractUserUniqueKeyFromOrder(order);
      
      if (userUniqueKey) {
        // 为用户添加订阅
        await this.userSubscriptionService.addSubscription(
          userUniqueKey,
          order.totalAmount,
          1, // 1个月
          order.outTradeNo
        );
        
        console.log(`用户订阅处理成功: ${userUniqueKey}, 订单: ${order.outTradeNo}`);
      } else {
        console.log(`订单 ${order.outTradeNo} 未包含用户信息，跳过订阅处理`);
      }
    } catch (error) {
      console.error('处理用户订阅失败:', error.message);
      // 不抛出错误，避免影响支付流程
    }
  }

  /**
   * 从订单中提取用户唯一标识
   * @param {Order} order - 订单对象
   * @returns {string|null} 用户唯一标识或null
   * @private
   */
  _extractUserUniqueKeyFromOrder(order) {
    // 尝试从订单的body或subject中提取用户信息
    const bodyMatch = order.body.match(/用户\s+([^\s]+)/);
    if (bodyMatch) {
      return bodyMatch[1];
    }
    
    // 如果没有找到，返回null
    return null;
  }

  /**
   * 获取支付配置信息
   * @returns {Object} 配置信息
   */
  getPaymentConfig() {
    return this.config.getConfig();
  }
}

module.exports = PaymentService;