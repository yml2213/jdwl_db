const { Order, ORDER_STATUS, VALID_STATUS_TRANSITIONS } = require('../models/Order');

describe('Order Model', () => {
  const validOrderData = {
    outTradeNo: 'test_order_123456',
    subject: 'Test Product',
    totalAmount: 99.99,
    body: 'Test product description'
  };

  describe('Constructor and Validation', () => {
    test('should create a valid order with required fields', () => {
      const order = new Order(validOrderData);
      
      expect(order.outTradeNo).toBe(validOrderData.outTradeNo);
      expect(order.subject).toBe(validOrderData.subject);
      expect(order.totalAmount).toBe(validOrderData.totalAmount);
      expect(order.status).toBe(ORDER_STATUS.PENDING);
      expect(order.id).toBeDefined();
      expect(order.createdAt).toBeInstanceOf(Date);
      expect(order.updatedAt).toBeInstanceOf(Date);
    });

    test('should generate unique order ID when not provided', () => {
      const order1 = new Order(validOrderData);
      const order2 = new Order(validOrderData);
      
      expect(order1.id).toBeDefined();
      expect(order2.id).toBeDefined();
      expect(order1.id).not.toBe(order2.id);
      expect(order1.id).toMatch(/^order_\d+_[a-z0-9]+$/);
    });

    test('should use provided order ID', () => {
      const customId = 'custom_order_id';
      const order = new Order({ ...validOrderData, id: customId });
      
      expect(order.id).toBe(customId);
    });

    test('should throw error for missing outTradeNo', () => {
      const invalidData = { ...validOrderData };
      delete invalidData.outTradeNo;
      
      expect(() => new Order(invalidData)).toThrow('outTradeNo is required');
    });

    test('should throw error for missing subject', () => {
      const invalidData = { ...validOrderData };
      delete invalidData.subject;
      
      expect(() => new Order(invalidData)).toThrow('subject is required');
    });

    test('should throw error for invalid totalAmount', () => {
      expect(() => new Order({ ...validOrderData, totalAmount: 0 }))
        .toThrow('totalAmount is required and must be a positive number');
      
      expect(() => new Order({ ...validOrderData, totalAmount: -10 }))
        .toThrow('totalAmount is required and must be a positive number');
      
      expect(() => new Order({ ...validOrderData, totalAmount: 'invalid' }))
        .toThrow('totalAmount is required and must be a positive number');
    });

    test('should throw error for invalid outTradeNo format', () => {
      expect(() => new Order({ ...validOrderData, outTradeNo: '12345' }))
        .toThrow('outTradeNo must be 6-64 characters long');
      
      expect(() => new Order({ ...validOrderData, outTradeNo: 'a'.repeat(65) }))
        .toThrow('outTradeNo must be 6-64 characters long');
      
      expect(() => new Order({ ...validOrderData, outTradeNo: 'test-order' }))
        .toThrow('contain only letters, numbers, and underscores');
    });

    test('should throw error for invalid amount precision', () => {
      expect(() => new Order({ ...validOrderData, totalAmount: 99.999 }))
        .toThrow('totalAmount can have at most 2 decimal places');
    });

    test('should throw error for amount out of range', () => {
      expect(() => new Order({ ...validOrderData, totalAmount: 0.001 }))
        .toThrow('totalAmount must be between 0.01 and 100000');
      
      expect(() => new Order({ ...validOrderData, totalAmount: 100001 }))
        .toThrow('totalAmount must be between 0.01 and 100000');
    });

    test('should accept valid amount with 2 decimal places', () => {
      const order = new Order({ ...validOrderData, totalAmount: 99.99 });
      expect(order.totalAmount).toBe(99.99);
    });

    test('should accept valid amount with 1 decimal place', () => {
      const order = new Order({ ...validOrderData, totalAmount: 99.9 });
      expect(order.totalAmount).toBe(99.9);
    });

    test('should accept integer amount', () => {
      const order = new Order({ ...validOrderData, totalAmount: 99 });
      expect(order.totalAmount).toBe(99);
    });
  });

  describe('Status Management', () => {
    let order;

    beforeEach(() => {
      order = new Order(validOrderData);
    });

    test('should initialize with PENDING status', () => {
      expect(order.status).toBe(ORDER_STATUS.PENDING);
    });

    test('should allow valid status transitions from PENDING', () => {
      expect(() => order.updateStatus(ORDER_STATUS.PAID)).not.toThrow();
      
      order = new Order(validOrderData);
      expect(() => order.updateStatus(ORDER_STATUS.FAILED)).not.toThrow();
      
      order = new Order(validOrderData);
      expect(() => order.updateStatus(ORDER_STATUS.CANCELLED)).not.toThrow();
    });

    test('should prevent invalid status transitions', () => {
      order.updateStatus(ORDER_STATUS.PAID);
      expect(() => order.updateStatus(ORDER_STATUS.PENDING))
        .toThrow('Invalid status transition from paid to pending');
      
      expect(() => order.updateStatus(ORDER_STATUS.FAILED))
        .toThrow('Invalid status transition from paid to failed');
    });

    test('should update updatedAt when status changes', () => {
      const originalUpdatedAt = order.updatedAt;
      
      // Wait a bit to ensure different timestamp
      setTimeout(() => {
        order.updateStatus(ORDER_STATUS.PAID);
        expect(order.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
      }, 1);
    });

    test('should set paymentTime when status becomes PAID', () => {
      expect(order.paymentTime).toBeNull();
      
      order.updateStatus(ORDER_STATUS.PAID);
      expect(order.paymentTime).toBeInstanceOf(Date);
    });

    test('should not override existing paymentTime', () => {
      const existingPaymentTime = new Date('2023-01-01');
      order.paymentTime = existingPaymentTime;
      
      order.updateStatus(ORDER_STATUS.PAID);
      expect(order.paymentTime).toBe(existingPaymentTime);
    });

    test('should throw error for invalid status', () => {
      expect(() => order.updateStatus('invalid_status'))
        .toThrow('Invalid status: invalid_status');
    });
  });

  describe('Alipay Information', () => {
    let order;

    beforeEach(() => {
      order = new Order(validOrderData);
    });

    test('should set alipay trade information', () => {
      const tradeNo = '2023010122001234567890123456';
      const buyerLogonId = 'test@example.com';
      
      order.setAlipayInfo(tradeNo, buyerLogonId);
      
      expect(order.tradeNo).toBe(tradeNo);
      expect(order.buyerLogonId).toBe(buyerLogonId);
      expect(order.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('Helper Methods', () => {
    let order;

    beforeEach(() => {
      order = new Order(validOrderData);
    });

    test('canPay should return true for PENDING orders', () => {
      expect(order.canPay()).toBe(true);
    });

    test('canPay should return false for non-PENDING orders', () => {
      order.updateStatus(ORDER_STATUS.PAID);
      expect(order.canPay()).toBe(false);
      
      order = new Order(validOrderData);
      order.updateStatus(ORDER_STATUS.FAILED);
      expect(order.canPay()).toBe(false);
      
      order = new Order(validOrderData);
      order.updateStatus(ORDER_STATUS.CANCELLED);
      expect(order.canPay()).toBe(false);
    });

    test('isPaid should return true only for PAID orders', () => {
      expect(order.isPaid()).toBe(false);
      
      order.updateStatus(ORDER_STATUS.PAID);
      expect(order.isPaid()).toBe(true);
    });
  });

  describe('JSON Serialization', () => {
    test('should convert order to JSON', () => {
      const order = new Order(validOrderData);
      const json = order.toJSON();
      
      expect(json).toEqual({
        id: order.id,
        outTradeNo: order.outTradeNo,
        subject: order.subject,
        totalAmount: order.totalAmount,
        status: order.status,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        tradeNo: order.tradeNo,
        buyerLogonId: order.buyerLogonId,
        paymentTime: order.paymentTime,
        body: order.body
      });
    });

    test('should create order from JSON', () => {
      const originalOrder = new Order(validOrderData);
      originalOrder.updateStatus(ORDER_STATUS.PAID);
      originalOrder.setAlipayInfo('test_trade_no', 'test@example.com');
      
      const json = originalOrder.toJSON();
      const restoredOrder = Order.fromJSON(json);
      
      expect(restoredOrder.id).toBe(originalOrder.id);
      expect(restoredOrder.outTradeNo).toBe(originalOrder.outTradeNo);
      expect(restoredOrder.subject).toBe(originalOrder.subject);
      expect(restoredOrder.totalAmount).toBe(originalOrder.totalAmount);
      expect(restoredOrder.status).toBe(originalOrder.status);
      expect(restoredOrder.tradeNo).toBe(originalOrder.tradeNo);
      expect(restoredOrder.buyerLogonId).toBe(originalOrder.buyerLogonId);
      expect(restoredOrder.createdAt.getTime()).toBe(originalOrder.createdAt.getTime());
      expect(restoredOrder.updatedAt.getTime()).toBe(originalOrder.updatedAt.getTime());
      expect(restoredOrder.paymentTime.getTime()).toBe(originalOrder.paymentTime.getTime());
    });
  });

  describe('Status Transitions Validation', () => {
    test('should have correct status transition rules', () => {
      expect(VALID_STATUS_TRANSITIONS[ORDER_STATUS.PENDING]).toEqual([
        ORDER_STATUS.PAID,
        ORDER_STATUS.FAILED,
        ORDER_STATUS.CANCELLED
      ]);
      
      expect(VALID_STATUS_TRANSITIONS[ORDER_STATUS.PAID]).toEqual([]);
      
      expect(VALID_STATUS_TRANSITIONS[ORDER_STATUS.FAILED]).toEqual([
        ORDER_STATUS.PENDING,
        ORDER_STATUS.CANCELLED
      ]);
      
      expect(VALID_STATUS_TRANSITIONS[ORDER_STATUS.CANCELLED]).toEqual([]);
    });

    test('should allow transition from FAILED back to PENDING', () => {
      const order = new Order(validOrderData);
      order.updateStatus(ORDER_STATUS.FAILED);
      
      expect(() => order.updateStatus(ORDER_STATUS.PENDING)).not.toThrow();
      expect(order.status).toBe(ORDER_STATUS.PENDING);
    });
  });
});