const fs = require('fs').promises;
const path = require('path');
const OrderManager = require('../services/OrderManager');
const { Order, ORDER_STATUS } = require('../models/Order');

describe('OrderManager', () => {
  const testDataPath = './test_data/orders_test.json';
  let orderManager;

  const validOrderData = {
    outTradeNo: 'test_order_123456',
    subject: 'Test Product',
    totalAmount: 99.99,
    body: 'Test product description'
  };

  beforeEach(async () => {
    orderManager = new OrderManager(testDataPath);
    
    // 清理测试数据文件
    try {
      await fs.unlink(testDataPath);
    } catch (error) {
      // 文件不存在，忽略错误
    }
  });

  afterEach(async () => {
    // 清理测试数据文件和目录
    try {
      await fs.unlink(testDataPath);
      await fs.rmdir(path.dirname(testDataPath));
    } catch (error) {
      // 忽略清理错误
    }
  });

  describe('Initialization', () => {
    test('should initialize successfully with new data file', async () => {
      await orderManager.initialize();
      expect(orderManager.initialized).toBe(true);
    });

    test('should create data directory if it does not exist', async () => {
      await orderManager.initialize();
      
      const dataDir = path.dirname(testDataPath);
      const stats = await fs.stat(dataDir);
      expect(stats.isDirectory()).toBe(true);
    });

    test('should load existing data from file', async () => {
      // 先创建一些测试数据
      const order1 = new Order({ ...validOrderData, outTradeNo: 'order_001' });
      const order2 = new Order({ ...validOrderData, outTradeNo: 'order_002' });
      
      const testData = [order1.toJSON(), order2.toJSON()];
      await fs.mkdir(path.dirname(testDataPath), { recursive: true });
      await fs.writeFile(testDataPath, JSON.stringify(testData), 'utf8');
      
      // 创建新的管理器实例并初始化
      const newManager = new OrderManager(testDataPath);
      await newManager.initialize();
      
      const orders = await newManager.getAllOrders();
      expect(orders).toHaveLength(2);
      expect(orders.find(o => o.outTradeNo === 'order_001')).toBeDefined();
      expect(orders.find(o => o.outTradeNo === 'order_002')).toBeDefined();
    });

    test('should handle corrupted data file gracefully', async () => {
      // 创建损坏的数据文件
      await fs.mkdir(path.dirname(testDataPath), { recursive: true });
      await fs.writeFile(testDataPath, 'invalid json', 'utf8');
      
      await expect(orderManager.initialize()).rejects.toThrow('Failed to initialize OrderManager');
    });
  });

  describe('Order Creation', () => {
    beforeEach(async () => {
      await orderManager.initialize();
    });

    test('should create a new order successfully', async () => {
      const order = await orderManager.createOrder(validOrderData);
      
      expect(order).toBeInstanceOf(Order);
      expect(order.outTradeNo).toBe(validOrderData.outTradeNo);
      expect(order.subject).toBe(validOrderData.subject);
      expect(order.totalAmount).toBe(validOrderData.totalAmount);
      expect(order.status).toBe(ORDER_STATUS.PENDING);
    });

    test('should prevent duplicate outTradeNo', async () => {
      await orderManager.createOrder(validOrderData);
      
      await expect(orderManager.createOrder(validOrderData))
        .rejects.toThrow('Order with outTradeNo test_order_123456 already exists');
    });

    test('should persist order to file', async () => {
      await orderManager.createOrder(validOrderData);
      
      // 创建新的管理器实例来验证持久化
      const newManager = new OrderManager(testDataPath);
      await newManager.initialize();
      
      const orders = await newManager.getAllOrders();
      expect(orders).toHaveLength(1);
      expect(orders[0].outTradeNo).toBe(validOrderData.outTradeNo);
    });
  });

  describe('Order Retrieval', () => {
    let createdOrder;

    beforeEach(async () => {
      await orderManager.initialize();
      createdOrder = await orderManager.createOrder(validOrderData);
    });

    test('should get order by ID', async () => {
      const order = await orderManager.getOrder(createdOrder.id);
      
      expect(order).toBeDefined();
      expect(order.id).toBe(createdOrder.id);
      expect(order.outTradeNo).toBe(validOrderData.outTradeNo);
    });

    test('should return null for non-existent order ID', async () => {
      const order = await orderManager.getOrder('non_existent_id');
      expect(order).toBeNull();
    });

    test('should get order by outTradeNo', async () => {
      const order = await orderManager.getOrderByOutTradeNo(validOrderData.outTradeNo);
      
      expect(order).toBeDefined();
      expect(order.outTradeNo).toBe(validOrderData.outTradeNo);
    });

    test('should return null for non-existent outTradeNo', async () => {
      const order = await orderManager.getOrderByOutTradeNo('non_existent_trade_no');
      expect(order).toBeNull();
    });

    test('should get order by tradeNo', async () => {
      const tradeNo = '2023010122001234567890123456';
      createdOrder.setAlipayInfo(tradeNo, 'test@example.com');
      await orderManager.updateOrderAlipayInfo(createdOrder.id, tradeNo, 'test@example.com');
      
      const order = await orderManager.getOrderByTradeNo(tradeNo);
      
      expect(order).toBeDefined();
      expect(order.tradeNo).toBe(tradeNo);
    });

    test('should return null for non-existent tradeNo', async () => {
      const order = await orderManager.getOrderByTradeNo('non_existent_trade_no');
      expect(order).toBeNull();
    });
  });

  describe('Order Listing', () => {
    beforeEach(async () => {
      await orderManager.initialize();
      
      // 创建多个测试订单
      await orderManager.createOrder({ ...validOrderData, outTradeNo: 'order_001' });
      await orderManager.createOrder({ ...validOrderData, outTradeNo: 'order_002' });
      await orderManager.createOrder({ ...validOrderData, outTradeNo: 'order_003' });
      
      // 更新一些订单状态
      const orders = await orderManager.getAllOrders();
      await orderManager.updateOrderStatus(orders[0].id, ORDER_STATUS.PAID);
      await orderManager.updateOrderStatus(orders[1].id, ORDER_STATUS.FAILED);
    });

    test('should get all orders', async () => {
      const orders = await orderManager.getAllOrders();
      expect(orders).toHaveLength(3);
    });

    test('should filter orders by status', async () => {
      const paidOrders = await orderManager.getAllOrders({ status: ORDER_STATUS.PAID });
      const failedOrders = await orderManager.getAllOrders({ status: ORDER_STATUS.FAILED });
      const pendingOrders = await orderManager.getAllOrders({ status: ORDER_STATUS.PENDING });
      
      expect(paidOrders).toHaveLength(1);
      expect(failedOrders).toHaveLength(1);
      expect(pendingOrders).toHaveLength(1);
    });

    test('should limit number of returned orders', async () => {
      const orders = await orderManager.getAllOrders({ limit: 2 });
      expect(orders).toHaveLength(2);
    });

    test('should support pagination with offset', async () => {
      const firstPage = await orderManager.getAllOrders({ limit: 2, offset: 0 });
      const secondPage = await orderManager.getAllOrders({ limit: 2, offset: 2 });
      
      expect(firstPage).toHaveLength(2);
      expect(secondPage).toHaveLength(1);
      expect(firstPage[0].id).not.toBe(secondPage[0].id);
    });

    test('should sort orders by creation time (newest first)', async () => {
      const orders = await orderManager.getAllOrders();
      
      for (let i = 1; i < orders.length; i++) {
        expect(orders[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(
          orders[i].createdAt.getTime()
        );
      }
    });
  });

  describe('Order Updates', () => {
    let createdOrder;

    beforeEach(async () => {
      await orderManager.initialize();
      createdOrder = await orderManager.createOrder(validOrderData);
    });

    test('should update order status', async () => {
      const updatedOrder = await orderManager.updateOrderStatus(createdOrder.id, ORDER_STATUS.PAID);
      
      expect(updatedOrder.status).toBe(ORDER_STATUS.PAID);
      expect(updatedOrder.paymentTime).toBeInstanceOf(Date);
    });

    test('should throw error for non-existent order', async () => {
      await expect(orderManager.updateOrderStatus('non_existent_id', ORDER_STATUS.PAID))
        .rejects.toThrow('Order with ID non_existent_id not found');
    });

    test('should update alipay information', async () => {
      const tradeNo = '2023010122001234567890123456';
      const buyerLogonId = 'test@example.com';
      
      const updatedOrder = await orderManager.updateOrderAlipayInfo(
        createdOrder.id,
        tradeNo,
        buyerLogonId
      );
      
      expect(updatedOrder.tradeNo).toBe(tradeNo);
      expect(updatedOrder.buyerLogonId).toBe(buyerLogonId);
    });

    test('should persist updates to file', async () => {
      await orderManager.updateOrderStatus(createdOrder.id, ORDER_STATUS.PAID);
      
      // 创建新的管理器实例来验证持久化
      const newManager = new OrderManager(testDataPath);
      await newManager.initialize();
      
      const order = await newManager.getOrder(createdOrder.id);
      expect(order.status).toBe(ORDER_STATUS.PAID);
    });
  });

  describe('Order Deletion', () => {
    let createdOrder;

    beforeEach(async () => {
      await orderManager.initialize();
      createdOrder = await orderManager.createOrder(validOrderData);
    });

    test('should delete order successfully', async () => {
      const deleted = await orderManager.deleteOrder(createdOrder.id);
      expect(deleted).toBe(true);
      
      const order = await orderManager.getOrder(createdOrder.id);
      expect(order).toBeNull();
    });

    test('should return false for non-existent order', async () => {
      const deleted = await orderManager.deleteOrder('non_existent_id');
      expect(deleted).toBe(false);
    });

    test('should persist deletion to file', async () => {
      await orderManager.deleteOrder(createdOrder.id);
      
      // 创建新的管理器实例来验证持久化
      const newManager = new OrderManager(testDataPath);
      await newManager.initialize();
      
      const orders = await newManager.getAllOrders();
      expect(orders).toHaveLength(0);
    });
  });

  describe('Order Statistics', () => {
    beforeEach(async () => {
      await orderManager.initialize();
      
      // 创建不同状态的订单
      const order1 = await orderManager.createOrder({ ...validOrderData, outTradeNo: 'order_001', totalAmount: 100 });
      const order2 = await orderManager.createOrder({ ...validOrderData, outTradeNo: 'order_002', totalAmount: 200 });
      const order3 = await orderManager.createOrder({ ...validOrderData, outTradeNo: 'order_003', totalAmount: 300 });
      
      await orderManager.updateOrderStatus(order1.id, ORDER_STATUS.PAID);
      await orderManager.updateOrderStatus(order2.id, ORDER_STATUS.FAILED);
      // order3 保持 PENDING 状态
    });

    test('should calculate order statistics correctly', async () => {
      const stats = await orderManager.getOrderStats();
      
      expect(stats.total).toBe(3);
      expect(stats.pending).toBe(1);
      expect(stats.paid).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.cancelled).toBe(0);
      expect(stats.totalAmount).toBe(600);
      expect(stats.paidAmount).toBe(100);
    });
  });

  describe('Utility Methods', () => {
    beforeEach(async () => {
      await orderManager.initialize();
      await orderManager.createOrder(validOrderData);
    });

    test('should clear all orders', async () => {
      let orders = await orderManager.getAllOrders();
      expect(orders).toHaveLength(1);
      
      await orderManager.clearAllOrders();
      
      orders = await orderManager.getAllOrders();
      expect(orders).toHaveLength(0);
    });

    test('should persist clear operation to file', async () => {
      await orderManager.clearAllOrders();
      
      // 创建新的管理器实例来验证持久化
      const newManager = new OrderManager(testDataPath);
      await newManager.initialize();
      
      const orders = await newManager.getAllOrders();
      expect(orders).toHaveLength(0);
    });
  });

  describe('Auto-initialization', () => {
    test('should auto-initialize when calling methods', async () => {
      const newManager = new OrderManager(testDataPath);
      expect(newManager.initialized).toBe(false);
      
      // 调用方法应该自动初始化
      await newManager.createOrder(validOrderData);
      expect(newManager.initialized).toBe(true);
    });
  });
});