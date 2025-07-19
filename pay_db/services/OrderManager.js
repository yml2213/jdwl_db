const fs = require('fs').promises;
const path = require('path');
const { Order, ORDER_STATUS } = require('../models/Order');

/**
 * 订单管理器
 * 负责订单的 CRUD 操作和数据持久化
 */
class OrderManager {
  constructor(dataFilePath = './data/orders.json') {
    this.dataFilePath = dataFilePath;
    this.orders = new Map(); // 内存中的订单缓存
    this.initialized = false;
  }

  /**
   * 初始化订单管理器，从文件加载数据
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // 确保数据目录存在
      const dataDir = path.dirname(this.dataFilePath);
      await fs.mkdir(dataDir, { recursive: true });

      // 尝试加载现有数据
      await this._loadFromFile();
      this.initialized = true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // 文件不存在，创建空的数据文件
        await this._saveToFile();
        this.initialized = true;
      } else {
        throw new Error(`Failed to initialize OrderManager: ${error.message}`);
      }
    }
  }

  /**
   * 创建新订单
   * @param {Object} orderData 订单数据
   * @returns {Promise<Order>} 创建的订单
   */
  async createOrder(orderData) {
    await this._ensureInitialized();

    // 检查商户订单号是否已存在
    if (await this.getOrderByOutTradeNo(orderData.outTradeNo)) {
      throw new Error(`Order with outTradeNo ${orderData.outTradeNo} already exists`);
    }

    const order = new Order(orderData);
    this.orders.set(order.id, order);
    
    await this._saveToFile();
    return order;
  }

  /**
   * 根据订单ID获取订单
   * @param {string} orderId 订单ID
   * @returns {Promise<Order|null>} 订单对象或null
   */
  async getOrder(orderId) {
    await this._ensureInitialized();
    return this.orders.get(orderId) || null;
  }

  /**
   * 根据商户订单号获取订单
   * @param {string} outTradeNo 商户订单号
   * @returns {Promise<Order|null>} 订单对象或null
   */
  async getOrderByOutTradeNo(outTradeNo) {
    await this._ensureInitialized();
    
    for (const order of this.orders.values()) {
      if (order.outTradeNo === outTradeNo) {
        return order;
      }
    }
    return null;
  }

  /**
   * 根据支付宝交易号获取订单
   * @param {string} tradeNo 支付宝交易号
   * @returns {Promise<Order|null>} 订单对象或null
   */
  async getOrderByTradeNo(tradeNo) {
    await this._ensureInitialized();
    
    for (const order of this.orders.values()) {
      if (order.tradeNo === tradeNo) {
        return order;
      }
    }
    return null;
  }

  /**
   * 获取所有订单
   * @param {Object} options 查询选项
   * @param {string} options.status 按状态过滤
   * @param {number} options.limit 限制返回数量
   * @param {number} options.offset 偏移量
   * @returns {Promise<Order[]>} 订单列表
   */
  async getAllOrders(options = {}) {
    await this._ensureInitialized();
    
    let orders = Array.from(this.orders.values());
    
    // 按状态过滤
    if (options.status) {
      orders = orders.filter(order => order.status === options.status);
    }
    
    // 按创建时间倒序排列
    orders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    // 分页
    if (options.offset) {
      orders = orders.slice(options.offset);
    }
    if (options.limit) {
      orders = orders.slice(0, options.limit);
    }
    
    return orders;
  }

  /**
   * 更新订单状态
   * @param {string} orderId 订单ID
   * @param {string} newStatus 新状态
   * @returns {Promise<Order>} 更新后的订单
   */
  async updateOrderStatus(orderId, newStatus) {
    await this._ensureInitialized();
    
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Order with ID ${orderId} not found`);
    }

    order.updateStatus(newStatus);
    await this._saveToFile();
    return order;
  }

  /**
   * 更新订单的支付宝信息
   * @param {string} orderId 订单ID
   * @param {string} tradeNo 支付宝交易号
   * @param {string} buyerLogonId 买家支付宝账号
   * @returns {Promise<Order>} 更新后的订单
   */
  async updateOrderAlipayInfo(orderId, tradeNo, buyerLogonId) {
    await this._ensureInitialized();
    
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Order with ID ${orderId} not found`);
    }

    order.setAlipayInfo(tradeNo, buyerLogonId);
    await this._saveToFile();
    return order;
  }

  /**
   * 删除订单
   * @param {string} orderId 订单ID
   * @returns {Promise<boolean>} 是否删除成功
   */
  async deleteOrder(orderId) {
    await this._ensureInitialized();
    
    const deleted = this.orders.delete(orderId);
    if (deleted) {
      await this._saveToFile();
    }
    return deleted;
  }

  /**
   * 获取订单统计信息
   * @returns {Promise<Object>} 统计信息
   */
  async getOrderStats() {
    await this._ensureInitialized();
    
    const stats = {
      total: this.orders.size,
      pending: 0,
      paid: 0,
      failed: 0,
      cancelled: 0,
      totalAmount: 0,
      paidAmount: 0
    };

    for (const order of this.orders.values()) {
      stats[order.status]++;
      stats.totalAmount += order.totalAmount;
      
      if (order.status === ORDER_STATUS.PAID) {
        stats.paidAmount += order.totalAmount;
      }
    }

    return stats;
  }

  /**
   * 清空所有订单（主要用于测试）
   */
  async clearAllOrders() {
    await this._ensureInitialized();
    this.orders.clear();
    await this._saveToFile();
  }

  /**
   * 确保管理器已初始化
   */
  async _ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * 从文件加载订单数据
   */
  async _loadFromFile() {
    try {
      const data = await fs.readFile(this.dataFilePath, 'utf8');
      
      // 检查文件是否为空或只包含空白字符
      if (!data || data.trim() === '') {
        this.orders.clear();
        return;
      }
      
      // 检查文件是否为空或只包含空白字符
      if (!data || data.trim() === '') {
        this.orders.clear();
        return;
      }
      
      const ordersData = JSON.parse(data);
      
      this.orders.clear();
      for (const orderData of ordersData) {
        const order = Order.fromJSON(orderData);
        this.orders.set(order.id, order);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * 保存订单数据到文件
   */
  async _saveToFile() {
    const ordersData = Array.from(this.orders.values()).map(order => order.toJSON());
    const data = JSON.stringify(ordersData, null, 2);
    
    // 确保目录存在
    const dataDir = path.dirname(this.dataFilePath);
    await fs.mkdir(dataDir, { recursive: true });
    
    await fs.writeFile(this.dataFilePath, data, 'utf8');
  }
}

module.exports = OrderManager;