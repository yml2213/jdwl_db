const express = require('express');
const UserSubscriptionService = require('../services/UserSubscriptionService');

const router = express.Router();
const userSubscriptionService = new UserSubscriptionService();

/**
 * 创建订单接口
 * GET /CreateOrder?uniqueKey=xxx&Timestamp=xxx
 */
router.get('/CreateOrder', async (req, res) => {
  try {
    const { uniqueKey, Timestamp, extend, amount } = req.query;

    // 参数验证
    if (!uniqueKey) {
      return res.status(400).json({
        success: false,
        message: '缺少必需参数: uniqueKey'
      });
    }

    const timestamp = Timestamp ? parseInt(Timestamp) : Date.now();
    
    console.log(`收到创建订单请求: uniqueKey=${uniqueKey}, timestamp=${timestamp}, extend=${extend}`);

    // 检查用户订阅状态
    const subscriptionStatus = await userSubscriptionService.checkUserSubscription(uniqueKey);
    // 从环境变量读取价格，增加安全校验
    let subscriptionAmount = parseFloat(process.env.SUBSCRIPTION_AMOUNT);
    if (isNaN(subscriptionAmount) || subscriptionAmount <= 0) {
      console.warn(`环境变量 SUBSCRIPTION_AMOUNT 配置无效 ("${process.env.SUBSCRIPTION_AMOUNT}")，将使用默认值 300。`);
      subscriptionAmount = 300;
    }
    const totalAmount = amount ? parseFloat(amount) : subscriptionAmount;
    
    let orderInfo;
    let isNewUser = false;

    if (subscriptionStatus.isNewUser) {
      // 新用户：创建用户记录
      await userSubscriptionService.createUser(uniqueKey, timestamp);
      isNewUser = true;
      
      orderInfo = {
        outTradeNo: `ORDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        subject: '订阅服务-新用户',
        totalAmount,
        body: `用户 ${uniqueKey} 首次订阅，有效期1个月`
      };
    } else if (!subscriptionStatus.isValid) {
      // 老用户订阅已过期：续期
      orderInfo = {
        outTradeNo: `ORDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        subject: '订阅服务-续期',
        totalAmount,
        body: `用户 ${uniqueKey} 订阅续期，有效期1个月`
      };
    } else if (extend === 'true') {
      // 用户订阅有效但要求续费
      orderInfo = {
        outTradeNo: `ORDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        subject: '订阅服务-延期',
        totalAmount,
        body: `用户 ${uniqueKey} 订阅延期，有效期1个月`
      };
    } else {
      // 用户订阅仍有效 - 显示用户信息页面
      const userInfo = await userSubscriptionService.getUserInfo(uniqueKey);
      const userInfoPageHtml = generateUserInfoPageHtml(userInfo);
      return res.send(userInfoPageHtml);
    }

    // 在订单信息中保存用户信息，用于支付成功后处理
    orderInfo.userUniqueKey = uniqueKey;
    orderInfo.isNewUser = isNewUser;

    // 生成支付页面HTML
    const paymentPageHtml = generatePaymentPageHtml(orderInfo);
    
    res.send(paymentPageHtml);

  } catch (error) {
    console.error('创建订单失败:', error);
    res.status(500).json({
      success: false,
      message: '创建订单失败',
      error: error.message
    });
  }
});

/**
 * 查询用户订阅状态接口
 * GET /subscription/status?uniqueKey=xxx
 */
router.get('/subscription/status', async (req, res) => {
  try {
    const { uniqueKey } = req.query;

    if (!uniqueKey) {
      return res.status(400).json({
        success: false,
        message: '缺少必需参数: uniqueKey'
      });
    }

    const userInfo = await userSubscriptionService.getUserInfo(uniqueKey);
    
    if (!userInfo) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    res.json({
      success: true,
      data: {
        ...userInfo,
        validUntilFormatted: userInfo.currentStatus.validUntil ? 
          new Date(userInfo.currentStatus.validUntil).toLocaleString('zh-CN') : null
      }
    });

  } catch (error) {
    console.error('查询订阅状态失败:', error);
    res.status(500).json({
      success: false,
      message: '查询订阅状态失败',
      error: error.message
    });
  }
});

/**
 * 获取用户统计信息接口
 * GET /subscription/statistics
 */
router.get('/subscription/statistics', async (req, res) => {
  try {
    const statistics = await userSubscriptionService.getStatistics();
    
    res.json({
      success: true,
      data: statistics
    });

  } catch (error) {
    console.error('获取统计信息失败:', error);
    res.status(500).json({
      success: false,
      message: '获取统计信息失败',
      error: error.message
    });
  }
});

/**
 * 生成用户信息展示页面HTML
 * @param {Object} userInfo 用户信息
 * @returns {string} HTML字符串
 */
function generateUserInfoPageHtml(userInfo) {
  const activeSubscription = userInfo.subscriptions.find(sub => sub.status === 'active');
  const recentSubscriptions = userInfo.subscriptions.slice(0, 3);
  
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>用户订阅信息</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>👤</text></svg>">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif;
            background: #f5f5f5;
            min-height: 100vh;
            padding: 20px;
            line-height: 1.6;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            width: 100%;
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            overflow: hidden;
            animation: slideUp 0.6s ease-out;
        }
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .header {
            background: #fff;
            padding: 20px 24px;
            border-bottom: 1px solid #f0f0f0;
        }
        .header-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .header-info .user-title {
            font-size: 20px;
            font-weight: 600;
            color: #262626;
            margin-bottom: 4px;
        }
        .header-info .user-subtitle {
            font-size: 14px;
            color: #8c8c8c;
            font-family: 'SF Mono', Monaco, monospace;
        }
        .header-actions {
            display: flex;
            gap: 12px;
        }
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            text-decoration: none;
            text-align: center;
            display: inline-block;
        }
        .btn-primary {
            background: linear-gradient(135deg, #1890ff, #096dd9);
            color: white;
        }
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(24, 144, 255, 0.2);
        }
        .btn-secondary {
            background: #f5f5f5;
            color: #595959;
            border: 1px solid #d9d9d9;
        }
        .btn-secondary:hover {
            background: #e9e9e9;
            border-color: #bfbfbf;
        }
        .content { padding: 24px; }
        .section-title {
            font-size: 16px;
            font-weight: 600;
            color: #262626;
            margin-bottom: 16px;
        }
        .status-card {
            background: #fafafa;
            border-radius: 12px;
            padding: 20px;
            border: 1px solid #f0f0f0;
        }
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
        }
        .info-item {
            display: flex;
            flex-direction: column;
        }
        .info-label {
            color: #8c8c8c;
            font-size: 14px;
            margin-bottom: 4px;
        }
        .info-value {
            color: #262626;
            font-weight: 500;
            word-break: break-all;
        }
        .valid-until {
            color: #52c41a;
            font-weight: 600;
        }
        .status-valid {
             color: #52c41a;
             font-weight: 600;
        }
        .status-expired {
             color: #fa541c;
             font-weight: 600;
        }
        @media (max-width: 600px) {
            body { padding: 0; }
            .container { border-radius: 0; }
            .header-content { flex-direction: column; align-items: flex-start; gap: 16px; }
            .header-actions { width: 100%; }
            .header-actions .btn { flex: 1; }
            .info-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-content">
                <div class="header-info">
                    <div class="user-title">用户订阅状态</div>
                    <div class="user-subtitle">${userInfo.uniqueKey}</div>
                </div>
                <div class="header-actions">
                     <form action="/CreateOrder" method="get" style="display: contents;">
                        <input type="hidden" name="uniqueKey" value="${userInfo.uniqueKey}">
                        <input type="hidden" name="extend" value="true">
                        <button type="submit" class="btn btn-primary">续费订阅</button>
                    </form>
                    <a href="/CreateOrder?uniqueKey=${userInfo.uniqueKey}" class="btn btn-secondary">刷新状态</a>
                </div>
            </div>
        </div>

        <div class="content">
            <div class="section-title">订阅详情</div>
            <div class="status-card">
                 <div class="info-grid">
                    <div class="info-item">
                        <span class="info-label">订阅状态</span>
                        <span class="info-value ${userInfo.currentStatus.isValid ? 'status-valid' : 'status-expired'}">${userInfo.currentStatus.message}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">有效期至</span>
                        <span class="info-value valid-until">${activeSubscription ? activeSubscription.validUntilFormatted : '无有效订阅'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">注册时间</span>
                        <span class="info-value">${userInfo.createdAtFormatted}</span>
                    </div>
                    ${activeSubscription ? `
                    <div class="info-item">
                        <span class="info-label">当前订单号</span>
                        <span class="info-value">${activeSubscription.outTradeNo || '无'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">开始时间</span>
                        <span class="info-value">${activeSubscription.startTimeFormatted}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">支付时间</span>
                        <span class="info-value">${activeSubscription.paymentTimeFormatted}</span>
                    </div>
                    ` : ''}
                </div>
            </div>

            <div class="section-title" style="margin-top: 24px;">订阅历史</div>
            <div class="status-card">
                ${recentSubscriptions.length > 0 ? recentSubscriptions.map(sub => `
                <div class="info-grid history-grid">
                    <div class="info-item">
                        <span class="info-label">订阅ID</span>
                        <span class="info-value" style="font-family: monospace; font-size: 12px;">${sub.id}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">金额/时长</span>
                        <span class="info-value">¥${sub.amount} / ${sub.duration}个月</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">有效期</span>
                        <span class="info-value">${sub.startTimeFormatted} ~ ${sub.validUntilFormatted}</span>
                    </div>
                </div>
                `).join('<hr style="border: none; border-top: 1px solid #f0f0f0; margin: 16px 0;">') : `
                <div style="text-align: center; color: #8c8c8c;">暂无订阅历史</div>
                `}
                ${userInfo.subscriptions.length > 3 ? `<div style="text-align: center; color: #8c8c8c; padding-top: 16px; font-size: 14px;">为保证页面简洁，仅显示最近3条记录。</div>` : ''}
            </div>
        </div>
    </div>
</body>
</html>`;
}

/**
 * 生成支付页面HTML
 * @param {Object} orderInfo 订单信息
 * @returns {string} HTML字符串
 */
function generatePaymentPageHtml(orderInfo) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>确认支付</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>💳</text></svg>">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif;
            background: #f5f5f5;
            min-height: 100vh;
            padding: 20px;
            line-height: 1.6;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            width: 100%;
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            overflow: hidden;
            animation: slideUp 0.6s ease-out;
        }
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .header {
            background: #fff;
            padding: 20px 24px;
            border-bottom: 1px solid #f0f0f0;
        }
        .header-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .header-info .user-title {
            font-size: 20px;
            font-weight: 600;
            color: #262626;
            margin-bottom: 4px;
        }
        .header-info .user-subtitle {
            font-size: 14px;
            color: #8c8c8c;
        }
        .header-actions {
            display: flex;
            gap: 12px;
        }
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            text-decoration: none;
            text-align: center;
            display: inline-block;
        }
        .btn-primary {
            background: linear-gradient(135deg, #1890ff, #096dd9);
            color: white;
        }
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(24, 144, 255, 0.2);
        }
        .btn-secondary {
            background: #f5f5f5;
            color: #595959;
            border: 1px solid #d9d9d9;
        }
        .btn-secondary:hover {
            background: #e9e9e9;
            border-color: #bfbfbf;
        }
        .content { padding: 24px; }
        .price-section {
            text-align: center;
            margin-bottom: 24px;
            padding: 20px;
            background: #fafafa;
            border-radius: 12px;
            border: 1px solid #f0f0f0;
        }
        .price-label { font-size: 14px; color: #8c8c8c; margin-bottom: 8px; }
        .price-amount {
            font-size: 36px;
            font-weight: 700;
            color: #fa541c;
            font-family: 'SF Mono', Monaco, monospace;
        }
        .order-detail {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 0;
            border-bottom: 1px solid #f0f0f0;
        }
        .order-detail:last-child { border-bottom: none; }
        .order-label { color: #8c8c8c; font-size: 14px; }
        .order-value { color: #262626; font-weight: 500; text-align: right; word-break: break-all; margin-left: 12px;}
        .loading-section {
            display: none;
            text-align: center;
            padding: 16px;
            color: #8c8c8c;
        }
        .loading-spinner {
            display: inline-block; width: 20px; height: 20px;
            border: 2px solid #1890ff; border-radius: 50%;
            border-top-color: transparent;
            animation: spin 1s ease-in-out infinite;
            margin-right: 8px; vertical-align: middle;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 600px) {
            body { padding: 0; }
            .container { border-radius: 0; }
            .header-content { flex-direction: column; align-items: flex-start; gap: 16px; }
            .header-actions { width: 100%; }
            .header-actions .btn { flex: 1; }
        }
    </style>
</head>
<body>
    <form id="paymentForm" action="/initiate" method="post" style="width: 100%; max-width: 600px;">
        <div class="container">
            <div class="header">
                <div class="header-content">
                    <div class="header-info">
                        <div class="user-title">确认支付</div>
                        <div class="user-subtitle">${orderInfo.subject}</div>
                    </div>
                    <div class="header-actions">
                        <a href="javascript:history.back()" class="btn btn-secondary" id="cancelButton">取消</a>
                        <button type="submit" class="btn btn-primary" id="payButton">立即支付</button>
                    </div>
                </div>
            </div>
            <div class="content">
                <div class="price-section">
                    <div class="price-label">应付金额</div>
                    <div class="price-amount">¥ ${orderInfo.totalAmount}</div>
                </div>
                <div class="order-details">
                    <div class="order-detail">
                        <span class="order-label">用户标识</span>
                        <span class="order-value">${orderInfo.userUniqueKey}</span>
                    </div>
                    <div class="order-detail">
                        <span class="order-label">订单号</span>
                        <span class="order-value">${orderInfo.outTradeNo}</span>
                    </div>
                    <div class="order-detail">
                        <span class="order-label">服务说明</span>
                        <span class="order-value">${orderInfo.body}</span>
                    </div>
                </div>
                <div class="loading-section" id="loadingSection">
                    <div class="loading-spinner"></div>
                    <span>正在跳转到支付页面...</span>
                </div>
                <input type="hidden" name="outTradeNo" value="${orderInfo.outTradeNo}">
                <input type="hidden" name="subject" value="${orderInfo.subject}">
                <input type="hidden" name="totalAmount" value="${orderInfo.totalAmount}">
                <input type="hidden" name="body" value="${orderInfo.body}">
                <input type="hidden" name="userUniqueKey" value="${orderInfo.userUniqueKey}">
                <input type="hidden" name="isNewUser" value="${orderInfo.isNewUser}">
            </div>
        </div>
    </form>
    <script>
        document.getElementById('paymentForm').addEventListener('submit', function(e) {
            const payButton = document.getElementById('payButton');
            const cancelButton = document.getElementById('cancelButton');
            const loadingSection = document.getElementById('loadingSection');
            
            if (payButton.disabled) {
                e.preventDefault();
                return;
            }
            
            payButton.disabled = true;
            payButton.textContent = '处理中...';
            
            if (cancelButton) {
                cancelButton.style.pointerEvents = 'none';
                cancelButton.style.opacity = '0.65';
            }

            loadingSection.style.display = 'block';
        });
    </script>
</body>
</html>`;
}

module.exports = router;