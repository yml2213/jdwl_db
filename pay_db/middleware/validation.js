const PaymentError = require('../errors/PaymentError')
const { ERROR_CODES } = require('../errors/ErrorCodes')
const { logger } = require('../utils/logger')

/**
 * 验证支付请求参数
 */
const validatePaymentRequest = (req, res, next) => {
  try {
    const { subject, totalAmount, body } = req.body

    // 验证必填字段
    if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
      throw new PaymentError(
        ERROR_CODES.INVALID_PARAMETER,
        '订单标题不能为空',
        { field: 'subject', value: subject }
      )
    }

    if (!totalAmount) {
      throw new PaymentError(
        ERROR_CODES.INVALID_PARAMETER,
        '支付金额不能为空',
        { field: 'totalAmount', value: totalAmount }
      )
    }

    // 验证金额格式
    const amount = parseFloat(totalAmount)
    if (isNaN(amount) || amount <= 0) {
      throw new PaymentError(
        ERROR_CODES.INVALID_AMOUNT,
        '支付金额必须是大于0的数字',
        { field: 'totalAmount', value: totalAmount }
      )
    }

    // 验证金额范围（沙箱环境限制）
    if (amount > 10000) {
      throw new PaymentError(
        ERROR_CODES.INVALID_AMOUNT,
        '支付金额不能超过10000元',
        { field: 'totalAmount', value: totalAmount }
      )
    }

    // 验证金额精度（最多2位小数）
    if (!/^\d+(\.\d{1,2})?$/.test(totalAmount.toString())) {
      throw new PaymentError(
        ERROR_CODES.INVALID_AMOUNT,
        '支付金额最多保留2位小数',
        { field: 'totalAmount', value: totalAmount }
      )
    }

    // 验证订单标题长度
    if (subject.trim().length > 256) {
      throw new PaymentError(
        ERROR_CODES.INVALID_PARAMETER,
        '订单标题长度不能超过256个字符',
        { field: 'subject', value: subject }
      )
    }

    // 验证订单描述长度（可选字段）
    if (body && typeof body === 'string' && body.length > 400) {
      throw new PaymentError(
        ERROR_CODES.INVALID_PARAMETER,
        '订单描述长度不能超过400个字符',
        { field: 'body', value: body }
      )
    }

    // 标准化数据
    req.body.subject = subject.trim()
    req.body.totalAmount = amount.toFixed(2)
    req.body.body = body ? body.trim() : ''

    logger.info('支付请求参数验证通过', {
      subject: req.body.subject,
      totalAmount: req.body.totalAmount,
      body: req.body.body
    })

    next()
  } catch (error) {
    logger.error('支付请求参数验证失败:', error)
    next(error)
  }
}

/**
 * 验证订单ID参数
 */
const validateOrderId = (req, res, next) => {
  try {
    const { orderId } = req.params

    if (!orderId || typeof orderId !== 'string' || orderId.trim().length === 0) {
      throw new PaymentError(
        ERROR_CODES.INVALID_PARAMETER,
        '订单ID不能为空',
        { field: 'orderId', value: orderId }
      )
    }

    // 验证订单ID格式（假设使用UUID或时间戳格式）
    const orderIdPattern = /^[a-zA-Z0-9_-]+$/
    if (!orderIdPattern.test(orderId)) {
      throw new PaymentError(
        ERROR_CODES.INVALID_PARAMETER,
        '订单ID格式不正确',
        { field: 'orderId', value: orderId }
      )
    }

    // 验证订单ID长度
    if (orderId.length > 64) {
      throw new PaymentError(
        ERROR_CODES.INVALID_PARAMETER,
        '订单ID长度不能超过64个字符',
        { field: 'orderId', value: orderId }
      )
    }

    req.params.orderId = orderId.trim()

    logger.info('订单ID参数验证通过', { orderId: req.params.orderId })

    next()
  } catch (error) {
    logger.error('订单ID参数验证失败:', error)
    next(error)
  }
}

/**
 * 验证支付宝回调参数
 */
const validateAlipayCallback = (req, res, next) => {
  try {
    const params = req.method === 'POST' ? req.body : req.query

    // 验证必要的回调参数
    const requiredFields = ['out_trade_no', 'trade_status']
    const missingFields = requiredFields.filter(field => !params[field])

    if (missingFields.length > 0) {
      throw new PaymentError(
        ERROR_CODES.INVALID_PARAMETER,
        `缺少必要的回调参数: ${missingFields.join(', ')}`,
        { missingFields, params }
      )
    }

    logger.info('支付宝回调参数验证通过', {
      out_trade_no: params.out_trade_no,
      trade_status: params.trade_status
    })

    next()
  } catch (error) {
    logger.error('支付宝回调参数验证失败:', error)
    next(error)
  }
}

/**
 * 通用参数清理中间件
 */
const sanitizeInput = (req, res, next) => {
  // 清理查询参数
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = req.query[key].trim()
      }
    })
  }

  // 清理请求体参数
  if (req.body && typeof req.body === 'object') {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].trim()
      }
    })
  }

  next()
}

module.exports = {
  validatePaymentRequest,
  validateOrderId,
  validateAlipayCallback,
  sanitizeInput
}