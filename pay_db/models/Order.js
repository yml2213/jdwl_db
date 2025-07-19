/**
 * 订单数据模型
 * 定义订单的数据结构、验证规则和状态管理
 */

// 订单状态枚举
const ORDER_STATUS = {
  PENDING: 'pending',     // 待支付
  PAID: 'paid',          // 已支付
  FAILED: 'failed',      // 支付失败
  CANCELLED: 'cancelled' // 已取消
};

// 有效的状态转换规则
const VALID_STATUS_TRANSITIONS = {
  [ORDER_STATUS.PENDING]: [ORDER_STATUS.PAID, ORDER_STATUS.FAILED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.PAID]: [], // 已支付状态不能转换到其他状态
  [ORDER_STATUS.FAILED]: [ORDER_STATUS.PENDING, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.CANCELLED]: [] // 已取消状态不能转换到其他状态
};

class Order {
  constructor(orderData) {
    this.id = orderData.id || this._generateId();
    this.outTradeNo = orderData.outTradeNo;
    this.subject = orderData.subject;
    this.totalAmount = orderData.totalAmount;
    this.status = orderData.status || ORDER_STATUS.PENDING;
    this.createdAt = orderData.createdAt || new Date();
    this.updatedAt = orderData.updatedAt || new Date();
    this.tradeNo = orderData.tradeNo || null;
    this.buyerLogonId = orderData.buyerLogonId || null;
    this.paymentTime = orderData.paymentTime || null;
    this.body = orderData.body || '';
    
    // 验证订单数据
    this._validate();
  }

  /**
   * 生成唯一订单ID
   * @returns {string}
   */
  _generateId() {
    return 'order_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * 验证订单数据
   * @throws {Error} 验证失败时抛出错误
   */
  _validate() {
    const errors = [];

    // 验证必填字段
    if (!this.outTradeNo || typeof this.outTradeNo !== 'string') {
      errors.push('outTradeNo is required and must be a string');
    }

    if (!this.subject || typeof this.subject !== 'string') {
      errors.push('subject is required and must be a string');
    }

    if (!this.totalAmount || typeof this.totalAmount !== 'number' || this.totalAmount <= 0) {
      errors.push('totalAmount is required and must be a positive number');
    }

    // 验证订单状态
    if (!Object.values(ORDER_STATUS).includes(this.status)) {
      errors.push(`Invalid status: ${this.status}. Valid statuses are: ${Object.values(ORDER_STATUS).join(', ')}`);
    }

    // 验证商户订单号格式（字母数字下划线，长度6-64）
    if (this.outTradeNo && !/^[a-zA-Z0-9_]{6,64}$/.test(this.outTradeNo)) {
      errors.push('outTradeNo must be 6-64 characters long and contain only letters, numbers, and underscores');
    }

    // 验证金额精度（最多两位小数）
    if (this.totalAmount && !Number.isInteger(this.totalAmount * 100)) {
      errors.push('totalAmount can have at most 2 decimal places');
    }

    // 验证金额范围（0.01 - 100000）
    if (this.totalAmount && (this.totalAmount < 0.01 || this.totalAmount > 100000)) {
      errors.push('totalAmount must be between 0.01 and 100000');
    }

    if (errors.length > 0) {
      throw new Error(`Order validation failed: ${errors.join('; ')}`);
    }
  }

  /**
   * 更新订单状态
   * @param {string} newStatus 新状态
   * @throws {Error} 状态转换无效时抛出错误
   */
  updateStatus(newStatus) {
    if (!Object.values(ORDER_STATUS).includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}`);
    }

    const validTransitions = VALID_STATUS_TRANSITIONS[this.status];
    if (!validTransitions.includes(newStatus)) {
      throw new Error(`Invalid status transition from ${this.status} to ${newStatus}`);
    }

    this.status = newStatus;
    this.updatedAt = new Date();

    // 如果状态变为已支付，记录支付时间
    if (newStatus === ORDER_STATUS.PAID && !this.paymentTime) {
      this.paymentTime = new Date();
    }
  }

  /**
   * 设置支付宝交易信息
   * @param {string} tradeNo 支付宝交易号
   * @param {string} buyerLogonId 买家支付宝账号
   */
  setAlipayInfo(tradeNo, buyerLogonId) {
    this.tradeNo = tradeNo;
    this.buyerLogonId = buyerLogonId;
    this.updatedAt = new Date();
  }

  /**
   * 检查订单是否可以支付
   * @returns {boolean}
   */
  canPay() {
    return this.status === ORDER_STATUS.PENDING;
  }

  /**
   * 检查订单是否已支付
   * @returns {boolean}
   */
  isPaid() {
    return this.status === ORDER_STATUS.PAID;
  }

  /**
   * 获取订单的JSON表示
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      outTradeNo: this.outTradeNo,
      subject: this.subject,
      totalAmount: this.totalAmount,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      tradeNo: this.tradeNo,
      buyerLogonId: this.buyerLogonId,
      paymentTime: this.paymentTime,
      body: this.body
    };
  }

  /**
   * 从JSON数据创建订单实例
   * @param {Object} jsonData JSON数据
   * @returns {Order}
   */
  static fromJSON(jsonData) {
    return new Order({
      ...jsonData,
      createdAt: new Date(jsonData.createdAt),
      updatedAt: new Date(jsonData.updatedAt),
      paymentTime: jsonData.paymentTime ? new Date(jsonData.paymentTime) : null
    });
  }
}

module.exports = {
  Order,
  ORDER_STATUS,
  VALID_STATUS_TRANSITIONS
};