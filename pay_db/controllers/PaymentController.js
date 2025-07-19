const fs = require('fs');
const path = require('path');
const PaymentService = require('../services/PaymentService');
const { ORDER_STATUS } = require('../models/Order');

class PaymentController {
  constructor() {
    this.paymentService = new PaymentService();
  }

  async showPaymentPage(req, res, next) {
    try {
      const {
        outTradeNo = `ORDER_${Date.now()}`,
        subject = '商品-测试',
        totalAmount = 0.01,
        body = '这是一个测试商品，用于演示支付宝电脑网站支付功能。'
      } = req.query;

      const amount = parseFloat(totalAmount);
      if (isNaN(amount) || amount <= 0) {
        return res.status(400).send('无效的支付金额');
      }

      const orderInfo = {
        outTradeNo,
        subject,
        totalAmount: amount,
        body
      };

      res.send(this._renderTemplate('payment', orderInfo));
    } catch (error) {
      console.error('显示支付页面失败:', error.message);
      res.status(500).send('服务器内部错误');
    }
  }

  async initiatePayment(req, res, next) {
    try {
      const { outTradeNo, subject, totalAmount, body } = req.body;

      if (!outTradeNo || !subject || !totalAmount) {
        return res.status(400).json({ success: false, message: '缺少必填参数: outTradeNo, subject, totalAmount' });
      }
      if (typeof outTradeNo !== 'string' || outTradeNo.trim().length === 0) {
        return res.status(400).json({ success: false, message: '订单号必须为非空字符串' });
      }
      if (typeof subject !== 'string' || subject.trim().length === 0) {
        return res.status(400).json({ success: false, message: '商品标题必须为非空字符串' });
      }
      const amount = parseFloat(totalAmount);
      if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({ success: false, message: '无效的支付金额' });
      }
      if (amount < 0.01 || amount > 100000) {
        return res.status(400).json({ success: false, message: '支付金额必须在0.01-100000之间' });
      }
      if (!Number.isInteger(amount * 100)) {
        return res.status(400).json({ success: false, message: '支付金额最多支持两位小数' });
      }
      const trimmedOutTradeNo = String(outTradeNo).trim();
      if (!/^[a-zA-Z0-9_]{6,64}$/.test(trimmedOutTradeNo)) {
        return res.status(400).json({ success: false, message: '订单号格式无效，必须为6-64位字母数字下划线组合' });
      }
      const trimmedSubject = String(subject).trim();
      if (trimmedSubject.length > 256) {
        return res.status(400).json({ success: false, message: '商品标题长度不能超过256个字符' });
      }
      const trimmedBody = body ? String(body).trim() : trimmedSubject;
      if (trimmedBody.length > 400) {
        return res.status(400).json({ success: false, message: '商品描述长度不能超过400个字符' });
      }

      const orderInfo = {
        outTradeNo: trimmedOutTradeNo,
        subject: trimmedSubject,
        totalAmount: amount,
        body: trimmedBody
      };

      console.log('发起支付请求:', orderInfo);
      const result = await this.paymentService.createPaymentAndGenerateUrl(orderInfo, req);
      console.log('支付订单创建成功:', result.order.id);
      res.redirect(result.paymentUrl);
    } catch (error) {
      console.error('发起支付失败:', error.message);
      if (error.message.includes('订单号') && error.message.includes('已存在')) {
        return res.status(409).send(this._renderTemplate('payment_error', { title: '订单重复', message: error.message }));
      }
      if (error.message.includes('验证失败')) {
        return res.status(400).send(this._renderTemplate('payment_error', { title: '参数错误', message: error.message }));
      }
      res.status(500).send(this._renderTemplate('payment_error', { title: '支付发起失败', message: error.message }));
    }
  }

  async handleAlipayNotify(req, res) {
    const startTime = Date.now();
    const requestId = `notify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      console.log(`[${requestId}] 收到支付宝异步通知`);
      console.log(`[${requestId}] 请求IP:`, req.ip || (req.connection && req.connection.remoteAddress) || 'unknown');
      console.log(`[${requestId}] 请求头:`, JSON.stringify(req.headers, null, 2));
      console.log(`[${requestId}] 请求体:`, JSON.stringify(req.body, null, 2));

      if (!req.body || Object.keys(req.body).length === 0) {
        console.error(`[${requestId}] 异步通知请求体为空`);
        return res.send('failure');
      }

      const { out_trade_no, trade_no, trade_status, total_amount } = req.body;
      console.log(`[${requestId}] 关键参数 - 商户订单号: ${out_trade_no}, 支付宝交易号: ${trade_no}, 交易状态: ${trade_status}, 金额: ${total_amount}`);

      const result = await this.paymentService.handleNotifyCallback(req.body);
      const processingTime = Date.now() - startTime;

      if (result.success) {
        console.log(`[${requestId}] 异步通知处理成功: ${result.message} (耗时: ${processingTime}ms)`);
        if (result.order) {
          console.log(`[${requestId}] 订单状态更新: ${result.order.outTradeNo} -> ${result.order.status}`);
        }
        res.send('success');
      } else {
        console.error(`[${requestId}] 异步通知处理失败: ${result.message} (耗时: ${processingTime}ms)`);
        res.send('failure');
      }
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`[${requestId}] 处理异步通知异常: ${error.message} (耗时: ${processingTime}ms)`);
      console.error(`[${requestId}] 异常堆栈:`, error.stack);
      res.send('failure');
    }
  }

  async handleAlipayReturn(req, res) {
    const startTime = Date.now();
    const requestId = `return_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      console.log(`[${requestId}] 收到支付宝同步返回`);
      console.log(`[${requestId}] 请求IP:`, req.ip || (req.connection && req.connection.remoteAddress) || 'unknown');
      console.log(`[${requestId}] 用户代理:`, req.headers['user-agent']);
      console.log(`[${requestId}] 查询参数:`, JSON.stringify(req.query, null, 2));

      if (!req.query || Object.keys(req.query).length === 0) {
        console.error(`[${requestId}] 同步返回查询参数为空`);
        return res.send(this._renderTemplate('payment_error', { title: '参数错误', message: '缺少必要的支付返回参数' }));
      }

      const { out_trade_no, trade_no, trade_status, total_amount } = req.query;
      console.log(`[${requestId}] 关键参数 - 商户订单号: ${out_trade_no}, 支付宝交易号: ${trade_no}, 交易状态: ${trade_status}, 金额: ${total_amount}`);

      const result = await this.paymentService.handleReturnCallback(req.query);
      const processingTime = Date.now() - startTime;

      if (result.success && result.order) {
        console.log(`[${requestId}] 同步返回处理成功: ${result.message} (耗时: ${processingTime}ms)`);
        console.log(`[${requestId}] 订单信息: ${result.order.outTradeNo} - ${result.order.status}`);
        
        if (result.order.status === ORDER_STATUS.PAID) {
          console.log(`[${requestId}] 显示支付成功页面`);
          res.send(this._renderTemplate('payment_success', result.order));
        } else {
          console.log(`[${requestId}] 显示支付处理中页面，当前状态: ${result.order.status}`);
          res.send(this._renderTemplate('payment_pending', result.order));
        }
      } else {
        console.error(`[${requestId}] 同步返回处理失败: ${result.message} (耗时: ${processingTime}ms)`);
        res.send(this._renderTemplate('payment_error', { title: '支付处理失败', message: result.message }));
      }
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`[${requestId}] 处理同步返回异常: ${error.message} (耗时: ${processingTime}ms)`);
      console.error(`[${requestId}] 异常堆栈:`, error.stack);
      res.status(500).send(this._renderTemplate('payment_error', { title: '系统错误', message: '处理支付返回时发生异常' }));
    }
  }

  async getPaymentStatus(req, res) {
    try {
      const { outTradeNo } = req.params;

      if (!outTradeNo) {
        return res.status(400).json({ success: false, message: '缺少订单号参数' });
      }

      const result = await this.paymentService.queryPaymentStatus(outTradeNo);

      if (result.success) {
        res.json({ success: true, order: result.order });
      } else {
        res.status(404).json({ success: false, message: result.message });
      }
    } catch (error) {
      console.error('查询支付状态失败:', error.message);
      res.status(500).json({ success: false, message: '查询支付状态失败' });
    }
  }

  _renderTemplate(templateName, data) {
    const templatePath = path.join(__dirname, '..', 'views', `${templateName}.html`);
    try {
      let html = fs.readFileSync(templatePath, 'utf-8');
      for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          let value = data[key];
          if (key === 'paymentTime' && value) {
            value = new Date(value).toLocaleString('zh-CN');
          } else if (key === 'totalAmount' && typeof value === 'number') {
            value = value.toFixed(2);
          }
          html = html.replace(new RegExp(`{{${key}}}`, 'g'), this._escapeHtml(value));
        }
      }
      return html;
    } catch (error) {
      console.error(`Failed to render template ${templateName}`, error);
      return '<h1>Internal Server Error</h1>';
    }
  }

  _escapeHtml(text) {
    if (typeof text !== 'string') {
      return String(text);
    }
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}

module.exports = PaymentController;
