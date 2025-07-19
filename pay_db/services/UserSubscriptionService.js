const fs = require('fs').promises;
const path = require('path');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * 用户订阅管理服务
 */
class UserSubscriptionService {
  constructor() {
    this.usersFilePath = path.join(__dirname, '../data/users.json');
  }

  /**
   * 格式化时间戳为可读格式
   * @param {number} timestamp 时间戳
   * @returns {string} 格式化后的时间字符串
   */
  formatTimestamp(timestamp, tz = 'Asia/Shanghai') {
    return dayjs(timestamp).tz(tz).format('YYYY-MM-DD HH:mm:ss');
  }

  /**
   * 读取用户数据
   * @returns {Promise<Array>} 用户数据数组
   */
  async loadUsers() {
    try {
      await fs.access(this.usersFilePath);
      const data = await fs.readFile(this.usersFilePath, 'utf8');
      if (!data) {
        await this.saveUsers([]); // 文件为空，初始化
        return [];
      }
      return JSON.parse(data).users || [];
    } catch (error) {
      if (error.code === 'ENOENT') {
        await this.saveUsers([]); // 文件不存在，初始化
        return [];
      }
      console.error('读取用户数据失败:', error.message);
      return [];
    }
  }

  /**
   * 保存用户数据
   * @param {Array} users 用户数据数组
   * @returns {Promise<void>}
   */
  async saveUsers(users) {
    try {
      const dir = path.dirname(this.usersFilePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.usersFilePath, JSON.stringify({ users }, null, 2));
    } catch (error) {
      console.error('保存用户数据失败:', error.message);
      throw error;
    }
  }

  /**
   * 根据uniqueKey查找用户
   * @param {string} uniqueKey 用户唯一标识
   * @returns {Promise<Object|null>} 用户信息或null
   */
  async findUserByUniqueKey(uniqueKey) {
    const users = await this.loadUsers();
    return users.find(user => user.uniqueKey === uniqueKey) || null;
  }

  /**
   * 创建新用户
   * @param {string} uniqueKey 用户唯一标识
   * @param {number} timestamp 创建时间戳
   * @returns {Promise<Object>} 创建的用户信息
   */
  async createUser(uniqueKey, timestamp = Date.now()) {
    const users = await this.loadUsers();
    
    // 检查用户是否已存在
    const existingUser = users.find(user => user.uniqueKey === uniqueKey);
    if (existingUser) {
      throw new Error('用户已存在');
    }

    // 创建新用户
    const newUser = {
      uniqueKey,
      createdAt: timestamp,
      createdAtFormatted: this.formatTimestamp(timestamp),
      subscriptions: []
    };

    users.push(newUser);
    await this.saveUsers(users);

    console.log(`创建新用户: ${uniqueKey}`);
    return newUser;
  }

  /**
   * 为用户添加订阅记录
   * @param {string} uniqueKey 用户唯一标识
   * @param {number} amount 订阅金额
   * @param {number} duration 订阅时长（月）
   * @param {string} outTradeNo 订单号
   * @returns {Promise<Object>} 订阅记录
   */
  async addSubscription(uniqueKey, amount = 300, duration = 1, outTradeNo = null) {
    const users = await this.loadUsers();
    const userIndex = users.findIndex(user => user.uniqueKey === uniqueKey);
    
    if (userIndex === -1) {
      throw new Error('用户不存在');
    }

    const user = users[userIndex];
    const now = Date.now();
    
    // 计算新的有效期
    const lastValidUntil = this.getLastValidUntil(user.subscriptions);
    const startTime = dayjs.utc(lastValidUntil > now ? lastValidUntil : now);
    const validUntil = startTime.add(duration, 'month').valueOf();

    // 创建订阅记录
    const subscription = {
      id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      amount,
      duration,
      startTime,
      startTimeFormatted: this.formatTimestamp(startTime),
      validUntil,
      validUntilFormatted: this.formatTimestamp(validUntil),
      paymentTime: now,
      paymentTimeFormatted: this.formatTimestamp(now),
      outTradeNo,
      status: 'active'
    };

    user.subscriptions.push(subscription);
    await this.saveUsers(users);

    console.log(`用户 ${uniqueKey} 订阅成功，有效期至: ${this.formatTimestamp(validUntil)}`);
    return subscription;
  }

  /**
   * 获取用户最后的有效期
   * @param {Array} subscriptions 订阅记录数组
   * @returns {number} 最后有效期时间戳
   */
  getLastValidUntil(subscriptions) {
    if (!subscriptions || subscriptions.length === 0) {
      return 0;
    }

    return Math.max(...subscriptions.map(sub => sub.validUntil));
  }

  /**
   * 检查用户是否有效订阅
   * @param {string} uniqueKey 用户唯一标识
   * @returns {Promise<Object>} 订阅状态信息
   */
  async checkUserSubscription(uniqueKey) {
    const user = await this.findUserByUniqueKey(uniqueKey);
    
    if (!user) {
      return {
        isValid: false,
        isNewUser: true,
        message: '用户不存在'
      };
    }

    const lastValidUntil = this.getLastValidUntil(user.subscriptions);
    const now = Date.now();
    
    return {
      isValid: lastValidUntil > now,
      isNewUser: false,
      validUntil: lastValidUntil,
      validUntilFormatted: this.formatTimestamp(lastValidUntil),
      message: lastValidUntil > now ? '订阅有效' : '订阅已过期'
    };
  }

  /**
   * 获取用户信息
   * @param {string} uniqueKey 用户唯一标识
   * @returns {Promise<Object>} 用户信息
   */
  async getUserInfo(uniqueKey) {
    const user = await this.findUserByUniqueKey(uniqueKey);
    
    if (!user) {
      return null;
    }

    const subscriptionStatus = await this.checkUserSubscription(uniqueKey);
    
    // 确保用户有格式化的时间字段
    if (!user.createdAtFormatted && user.createdAt) {
      user.createdAtFormatted = this.formatTimestamp(user.createdAt);
    }

    // 确保订阅记录有格式化的时间字段
    const formattedSubscriptions = user.subscriptions.map(sub => ({
      ...sub,
      startTimeFormatted: sub.startTimeFormatted || this.formatTimestamp(sub.startTime),
      validUntilFormatted: sub.validUntilFormatted || this.formatTimestamp(sub.validUntil),
      paymentTimeFormatted: sub.paymentTimeFormatted || this.formatTimestamp(sub.paymentTime)
    }));
    
    return {
      uniqueKey: user.uniqueKey,
      createdAt: user.createdAt,
      createdAtFormatted: user.createdAtFormatted,
      subscriptions: formattedSubscriptions,
      currentStatus: subscriptionStatus
    };
  }

  /**
   * 获取所有用户统计信息
   * @returns {Promise<Object>} 统计信息
   */
  async getStatistics() {
    const users = await this.loadUsers();
    const now = Date.now();
    
    let activeUsers = 0;
    let totalRevenue = 0;
    
    for (const user of users) {
      const lastValidUntil = this.getLastValidUntil(user.subscriptions);
      if (lastValidUntil > now) {
        activeUsers++;
      }
      
      totalRevenue += user.subscriptions.reduce((sum, sub) => sum + sub.amount, 0);
    }

    return {
      totalUsers: users.length,
      activeUsers,
      totalRevenue,
      generatedAt: now
    };
  }
}

module.exports = UserSubscriptionService;