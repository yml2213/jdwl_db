# 故障排除和常见问题

## 概述

本文档收集了支付宝网页支付系统在开发、部署和运行过程中可能遇到的常见问题及其解决方案。

## 目录

- [启动问题](#启动问题)
- [支付相关问题](#支付相关问题)
- [签名验证问题](#签名验证问题)
- [回调处理问题](#回调处理问题)
- [网络连接问题](#网络连接问题)
- [配置问题](#配置问题)
- [性能问题](#性能问题)
- [部署问题](#部署问题)
- [日志和调试](#日志和调试)

## 启动问题

### 问题1: 端口被占用

**错误信息:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**原因:** 端口 3000 已被其他进程占用

**解决方案:**

1. **查找占用端口的进程:**
   ```bash
   # macOS/Linux
   lsof -i :3000
   
   # 或者使用 netstat
   netstat -tulpn | grep :3000
   ```

2. **终止占用进程:**
   ```bash
   # 根据 PID 终止进程
   kill -9 <PID>
   
   # 或者终止所有 node 进程
   pkill -f node
   ```

3. **使用其他端口:**
   ```bash
   export PORT=3001
   npm start
   ```

4. **检查 PM2 进程:**
   ```bash
   pm2 list
   pm2 delete all
   ```

### 问题2: 环境变量未加载

**错误信息:**
```
Error: ALIPAY_APP_ID is required
```

**原因:** 环境变量配置文件未正确加载

**解决方案:**

1. **检查 .env 文件是否存在:**
   ```bash
   ls -la .env*
   ```

2. **验证环境变量内容:**
   ```bash
   cat .env.sandbox
   ```

3. **手动加载环境变量:**
   ```bash
   source .env.sandbox
   npm start
   ```

4. **检查 dotenv 配置:**
   ```javascript
   // 在 index.js 顶部确保有
   require('dotenv').config();
   ```

### 问题3: 依赖安装失败

**错误信息:**
```
npm ERR! peer dep missing
```

**解决方案:**

1. **清理 npm 缓存:**
   ```bash
   npm cache clean --force
   ```

2. **删除 node_modules 重新安装:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **使用 yarn 替代 npm:**
   ```bash
   yarn install
   ```

## 支付相关问题

### 问题1: 支付页面无法跳转

**症状:** 点击支付按钮后没有跳转到支付宝页面

**可能原因:**
- 支付宝应用ID错误
- 签名生成失败
- 网关地址配置错误

**解决方案:**

1. **检查应用ID配置:**
   ```bash
   echo $ALIPAY_APP_ID
   ```

2. **验证网关地址:**
   ```bash
   # 沙箱环境
   curl -I https://openapi-sandbox.alipay.com/gateway.do
   
   # 生产环境
   curl -I https://openapi.alipay.com/gateway.do
   ```

3. **查看详细错误日志:**
   ```bash
   tail -f logs/error.log
   ```

4. **测试签名生成:**
   ```javascript
   // 在控制台中测试
   const { SignatureService } = require('./services/SignatureService');
   const service = new SignatureService();
   console.log(service.generateSignature({test: 'data'}, privateKey));
   ```

### 问题2: 支付金额显示错误

**症状:** 支付页面显示的金额与预期不符

**解决方案:**

1. **检查金额格式:**
   ```javascript
   // 确保金额为字符串格式，保留两位小数
   const amount = parseFloat(inputAmount).toFixed(2);
   ```

2. **验证金额范围:**
   ```javascript
   if (amount < 0.01 || amount > 100000.00) {
     throw new Error('金额超出允许范围');
   }
   ```

3. **检查货币单位:**
   - 支付宝接口使用人民币（元）
   - 确保不要传入分为单位的金额

### 问题3: 订单状态未更新

**症状:** 支付完成后订单状态仍为待支付

**可能原因:**
- 异步通知未收到
- 回调处理失败
- 签名验证失败

**解决方案:**

1. **检查回调地址可访问性:**
   ```bash
   curl -X POST https://your-domain.com/alipay/notify \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "test=data"
   ```

2. **查看回调日志:**
   ```bash
   grep "alipay/notify" logs/combined.log
   ```

3. **手动触发状态更新:**
   ```javascript
   // 在控制台中手动更新订单状态
   const { OrderManager } = require('./services/OrderManager');
   const orderManager = new OrderManager();
   orderManager.updateOrderStatus('order_id', 'paid');
   ```

## 签名验证问题

### 问题1: 签名验证失败

**错误信息:**
```
Error: Invalid signature
```

**常见原因:**
- 密钥文件格式错误
- 参数编码问题
- 签名算法不匹配

**解决方案:**

1. **验证密钥文件格式:**
   ```bash
   # 检查私钥格式
   openssl rsa -in keys/app_private_key.pem -text -noout
   
   # 检查公钥格式
   openssl rsa -pubin -in keys/alipay_public_key.pem -text -noout
   ```

2. **检查密钥文件权限:**
   ```bash
   chmod 600 keys/*.pem
   ls -la keys/
   ```

3. **验证参数编码:**
   ```javascript
   // 确保参数使用 UTF-8 编码
   const params = {
     app_id: appId,
     method: 'alipay.trade.page.pay',
     charset: 'utf-8',
     sign_type: 'RSA2',
     timestamp: new Date().toISOString(),
     version: '1.0'
   };
   ```

4. **调试签名生成过程:**
   ```javascript
   const crypto = require('crypto');
   
   // 打印待签名字符串
   console.log('待签名字符串:', signString);
   
   // 打印签名结果
   const sign = crypto.sign('RSA-SHA256', Buffer.from(signString, 'utf8'), privateKey);
   console.log('签名结果:', sign.toString('base64'));
   ```

### 问题2: 回调签名验证失败

**解决方案:**

1. **检查支付宝公钥:**
   ```bash
   # 确保使用的是支付宝公钥，不是应用公钥
   head -1 keys/alipay_public_key.pem
   ```

2. **验证回调参数:**
   ```javascript
   // 打印回调参数
   console.log('回调参数:', req.body);
   
   // 检查签名参数
   const { sign, sign_type, ...params } = req.body;
   console.log('签名:', sign);
   console.log('签名类型:', sign_type);
   ```

3. **手动验证签名:**
   ```javascript
   const { SignatureService } = require('./services/SignatureService');
   const service = new SignatureService();
   const isValid = service.verifySignature(params, sign, publicKey);
   console.log('签名验证结果:', isValid);
   ```

## 回调处理问题

### 问题1: 回调地址无法访问

**错误信息:** 支付宝无法访问回调地址

**解决方案:**

1. **检查防火墙设置:**
   ```bash
   # 检查端口是否开放
   sudo ufw status
   sudo ufw allow 3000
   ```

2. **使用内网穿透工具（开发环境）:**
   ```bash
   # 使用 ngrok
   ngrok http 3000
   
   # 使用 localtunnel
   npx localtunnel --port 3000
   ```

3. **验证 HTTPS 配置:**
   ```bash
   # 检查 SSL 证书
   openssl s_client -connect your-domain.com:443 -servername your-domain.com
   ```

4. **测试回调接口:**
   ```bash
   curl -X POST https://your-domain.com/alipay/notify \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "out_trade_no=test&trade_status=TRADE_SUCCESS"
   ```

### 问题2: 回调处理超时

**症状:** 支付宝回调超时，导致重复通知

**解决方案:**

1. **优化回调处理逻辑:**
   ```javascript
   // 异步处理，快速响应
   app.post('/alipay/notify', async (req, res) => {
     try {
       // 立即响应支付宝
       res.send('success');
       
       // 异步处理业务逻辑
       setImmediate(() => {
         processPaymentNotification(req.body);
       });
     } catch (error) {
       res.send('failure');
     }
   });
   ```

2. **增加超时配置:**
   ```javascript
   // 设置请求超时
   app.use(timeout('5s'));
   ```

3. **添加幂等性处理:**
   ```javascript
   // 防止重复处理同一笔订单
   const processedOrders = new Set();
   
   if (processedOrders.has(outTradeNo)) {
     return res.send('success');
   }
   processedOrders.add(outTradeNo);
   ```

## 网络连接问题

### 问题1: 连接支付宝网关超时

**错误信息:**
```
Error: connect ETIMEDOUT
```

**解决方案:**

1. **检查网络连接:**
   ```bash
   ping openapi.alipay.com
   telnet openapi.alipay.com 443
   ```

2. **配置代理（如果需要）:**
   ```javascript
   const https = require('https');
   const HttpsProxyAgent = require('https-proxy-agent');
   
   const agent = new HttpsProxyAgent('http://proxy-server:port');
   
   const options = {
     hostname: 'openapi.alipay.com',
     port: 443,
     path: '/gateway.do',
     method: 'POST',
     agent: agent
   };
   ```

3. **增加重试机制:**
   ```javascript
   const axios = require('axios');
   
   const axiosConfig = {
     timeout: 10000,
     retry: 3,
     retryDelay: 1000
   };
   ```

### 问题2: DNS 解析失败

**解决方案:**

1. **检查 DNS 配置:**
   ```bash
   nslookup openapi.alipay.com
   dig openapi.alipay.com
   ```

2. **使用公共 DNS:**
   ```bash
   # 临时修改 DNS
   echo "nameserver 8.8.8.8" > /etc/resolv.conf
   ```

3. **添加 hosts 记录:**
   ```bash
   # 如果 DNS 解析有问题，可以添加 hosts 记录
   echo "110.75.36.106 openapi.alipay.com" >> /etc/hosts
   ```

## 配置问题

### 问题1: 配置文件未生效

**解决方案:**

1. **检查配置文件路径:**
   ```bash
   pwd
   ls -la .env*
   ```

2. **验证配置加载:**
   ```javascript
   console.log('当前配置:', {
     NODE_ENV: process.env.NODE_ENV,
     PAYMENT_ENV: process.env.PAYMENT_ENV,
     ALIPAY_APP_ID: process.env.ALIPAY_APP_ID
   });
   ```

3. **手动加载配置:**
   ```javascript
   const dotenv = require('dotenv');
   dotenv.config({ path: '.env.production' });
   ```

### 问题2: 密钥路径错误

**解决方案:**

1. **使用绝对路径:**
   ```bash
   export ALIPAY_PRIVATE_KEY_PATH=/absolute/path/to/private_key.pem
   ```

2. **检查文件存在性:**
   ```javascript
   const fs = require('fs');
   const keyPath = process.env.ALIPAY_PRIVATE_KEY_PATH;
   
   if (!fs.existsSync(keyPath)) {
     throw new Error(`密钥文件不存在: ${keyPath}`);
   }
   ```

## 性能问题

### 问题1: 内存使用过高

**解决方案:**

1. **监控内存使用:**
   ```bash
   # 查看进程内存使用
   ps aux | grep node
   
   # 使用 PM2 监控
   pm2 monit
   ```

2. **配置内存限制:**
   ```javascript
   // ecosystem.config.js
   module.exports = {
     apps: [{
       name: 'alipay-payment',
       script: 'index.js',
       max_memory_restart: '500M'
     }]
   };
   ```

3. **优化代码:**
   ```javascript
   // 及时清理大对象
   let largeObject = null;
   
   // 使用流处理大文件
   const fs = require('fs');
   const stream = fs.createReadStream('large-file.json');
   ```

### 问题2: 响应时间过长

**解决方案:**

1. **添加性能监控:**
   ```javascript
   const responseTime = require('response-time');
   app.use(responseTime());
   ```

2. **优化数据库查询:**
   ```javascript
   // 添加索引，优化查询
   // 使用连接池
   // 实现查询缓存
   ```

3. **启用压缩:**
   ```javascript
   const compression = require('compression');
   app.use(compression());
   ```

## 部署问题

### 问题1: Docker 容器启动失败

**解决方案:**

1. **查看容器日志:**
   ```bash
   docker logs alipay-payment-app
   docker-compose logs -f
   ```

2. **检查 Dockerfile:**
   ```dockerfile
   # 确保基础镜像正确
   FROM node:18-alpine
   
   # 检查工作目录
   WORKDIR /app
   
   # 验证文件复制
   COPY . .
   ```

3. **验证环境变量:**
   ```bash
   docker exec -it alipay-payment-app env
   ```

### 问题2: PM2 进程管理问题

**解决方案:**

1. **检查 PM2 状态:**
   ```bash
   pm2 status
   pm2 logs alipay-payment
   ```

2. **重置 PM2:**
   ```bash
   pm2 kill
   pm2 start ecosystem.config.js --env production
   ```

3. **配置开机自启:**
   ```bash
   pm2 startup
   pm2 save
   ```

## 日志和调试

### 启用详细日志

```bash
# 设置日志级别为 debug
export LOG_LEVEL=debug
npm start
```

### 查看实时日志

```bash
# 查看应用日志
tail -f logs/combined.log

# 查看错误日志
tail -f logs/error.log

# 查看 PM2 日志
pm2 logs alipay-payment --lines 100
```

### 调试支付流程

```javascript
// 在关键位置添加调试日志
const { logger } = require('./utils/logger');

logger.debug('支付参数:', paymentParams);
logger.debug('签名字符串:', signString);
logger.debug('生成签名:', signature);
```

### 使用调试工具

```bash
# 使用 Node.js 调试器
node --inspect index.js

# 使用 Chrome DevTools
# 打开 chrome://inspect
```

## 获取帮助

### 官方文档

- [支付宝开放平台文档](https://opendocs.alipay.com/)
- [Node.js 官方文档](https://nodejs.org/docs/)
- [Express.js 文档](https://expressjs.com/)

### 社区支持

- [支付宝开放平台论坛](https://forum.alipay.com/)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/alipay)
- [GitHub Issues](https://github.com/your-repo/issues)

### 联系支持

如果以上解决方案都无法解决问题，请：

1. 收集详细的错误日志
2. 记录重现步骤
3. 提供环境信息（Node.js版本、操作系统等）
4. 提交 Issue 或联系技术支持

### 问题报告模板

```markdown
## 问题描述
[简要描述遇到的问题]

## 环境信息
- Node.js 版本: 
- 操作系统: 
- 支付环境: sandbox/production

## 重现步骤
1. 
2. 
3. 

## 期望结果
[描述期望的正确行为]

## 实际结果
[描述实际发生的情况]

## 错误日志
```
[粘贴相关的错误日志]
```

## 已尝试的解决方案
[列出已经尝试过的解决方法]
```