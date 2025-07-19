# 支付宝网页支付集成系统

一个基于 Node.js 和 Express.js 的支付宝网页支付集成解决方案，支持沙箱和生产环境，提供完整的支付流程管理。

## 功能特性

- ✅ 支付宝网页支付集成 (alipay.trade.page.pay)
- ✅ 沙箱和生产环境支持
- ✅ 完整的支付流程管理
- ✅ 订单状态跟踪
- ✅ 安全的签名验证
- ✅ 异步通知处理
- ✅ 错误处理和日志记录
- ✅ Docker 容器化支持
- ✅ PM2 进程管理
- ✅ 健康检查和监控

## 技术栈

- **后端**: Node.js, Express.js
- **支付**: 支付宝开放平台 SDK
- **进程管理**: PM2
- **容器化**: Docker, Docker Compose
- **反向代理**: Nginx
- **日志**: Winston
- **测试**: Jest

## 快速开始

### 环境要求

- Node.js 18+
- npm 或 yarn
- 支付宝开放平台应用（沙箱或正式）

### 安装步骤

1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd alipay-web-payment
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **配置环境变量**
   ```bash
   # 复制环境配置文件
   cp .env.example .env.sandbox
   
   # 编辑配置文件，填入你的支付宝应用信息
   nano .env.sandbox
   ```

4. **配置支付宝密钥**
   ```bash
   # 创建密钥目录
   mkdir keys
   
   # 将你的支付宝应用私钥和公钥放入 keys 目录
   # keys/sandbox_private_key.pem  - 应用私钥
   # keys/sandbox_public_key.pem   - 支付宝公钥
   ```

5. **启动应用**
   ```bash
   # 开发环境
   npm run dev
   
   # 沙箱环境
   npm run start:sandbox
   
   # 生产环境
   npm run start:production
   ```

6. **访问应用**
   
   打开浏览器访问 `http://localhost:3000`

### Docker 部署

1. **构建镜像**
   ```bash
   docker build -t alipay-payment .
   ```

2. **使用 Docker Compose 启动**
   ```bash
   docker-compose up -d
   ```

3. **查看日志**
   ```bash
   docker-compose logs -f
   ```

## 配置说明

### 环境变量配置

| 变量名 | 描述 | 默认值 | 必填 |
|--------|------|--------|------|
| `NODE_ENV` | 运行环境 | development | 否 |
| `PORT` | 服务端口 | 3000 | 否 |
| `HOST` | 服务主机 | localhost | 否 |
| `PAYMENT_ENV` | 支付环境 | sandbox | 是 |
| `ALIPAY_APP_ID` | 支付宝应用ID | - | 是 |
| `ALIPAY_PRIVATE_KEY_PATH` | 应用私钥路径 | - | 是 |
| `ALIPAY_PUBLIC_KEY_PATH` | 支付宝公钥路径 | - | 是 |
| `ALIPAY_GATEWAY_URL` | 支付宝网关地址 | - | 是 |
| `NOTIFY_URL` | 异步通知地址 | - | 是 |
| `RETURN_URL` | 同步返回地址 | - | 是 |

### 支付宝应用配置

1. **沙箱环境**
   - 登录 [支付宝开放平台](https://open.alipay.com/)
   - 进入沙箱应用管理
   - 获取应用ID、应用私钥、支付宝公钥

2. **生产环境**
   - 创建正式应用并通过审核
   - 配置应用网关和授权回调地址
   - 上线应用功能

## API 接口文档

### 支付相关接口

#### 1. 创建支付订单

**POST** `/payment/create`

**请求参数:**
```json
{
  "subject": "商品标题",
  "totalAmount": "0.01",
  "body": "商品描述",
  "outTradeNo": "商户订单号"
}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "orderId": "订单ID",
    "paymentUrl": "支付宝支付页面URL"
  }
}
```

#### 2. 查询支付状态

**GET** `/payment/status/:orderId`

**响应:**
```json
{
  "success": true,
  "data": {
    "orderId": "订单ID",
    "status": "paid|pending|failed|cancelled",
    "tradeNo": "支付宝交易号",
    "totalAmount": "支付金额"
  }
}
```

#### 3. 支付宝异步通知

**POST** `/alipay/notify`

支付宝服务器调用，用于接收支付结果通知。

#### 4. 支付宝同步返回

**GET** `/alipay/return`

用户支付完成后的页面跳转处理。

### 系统接口

#### 健康检查

**GET** `/health`

**响应:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "environment": "development",
  "paymentEnv": "sandbox",
  "uptime": 3600,
  "memory": {...},
  "version": "1.0.0"
}
```

## 部署指南

### 生产环境部署

1. **使用部署脚本**
   ```bash
   # 部署到生产环境
   sudo ./scripts/deploy.sh production
   ```

2. **手动部署**
   ```bash
   # 安装 PM2
   npm install -g pm2
   
   # 启动应用
   pm2 start ecosystem.config.js --env production
   
   # 保存 PM2 配置
   pm2 save
   pm2 startup
   ```

### 使用 PM2 管理

```bash
# 启动应用
npm run pm2:start:production

# 查看状态
pm2 status

# 查看日志
npm run pm2:logs

# 重启应用
npm run pm2:restart

# 停止应用
npm run pm2:stop
```

### Nginx 配置

项目包含了 `nginx.conf` 配置文件，支持：
- HTTPS 重定向
- 反向代理
- 静态文件缓存
- 安全头设置

## 开发指南

### 项目结构

```
├── config/              # 配置文件
├── controllers/         # 控制器
├── data/               # 数据文件
├── errors/             # 错误定义
├── keys/               # 密钥文件
├── logs/               # 日志文件
├── middleware/         # 中间件
├── models/             # 数据模型
├── public/             # 静态资源
├── routes/             # 路由定义
├── scripts/            # 部署脚本
├── services/           # 业务服务
├── utils/              # 工具函数
├── views/              # 视图模板
├── __tests__/          # 测试文件
├── .env.example        # 环境变量示例
├── .env.sandbox        # 沙箱环境配置
├── .env.production     # 生产环境配置
├── Dockerfile          # Docker 配置
├── docker-compose.yml  # Docker Compose 配置
├── ecosystem.config.js # PM2 配置
└── nginx.conf          # Nginx 配置
```

### 运行测试

```bash
# 运行所有测试
npm test

# 监听模式运行测试
npm run test:watch

# 运行特定测试文件
npm test -- PaymentService.test.js
```

### 日志查看

```bash
# 查看应用日志
tail -f logs/combined.log

# 查看错误日志
tail -f logs/error.log

# 查看 PM2 日志
pm2 logs alipay-payment
```

## 故障排除

### 常见问题

#### 1. 签名验证失败

**问题**: 支付宝回调签名验证失败

**解决方案**:
- 检查应用私钥和支付宝公钥是否正确
- 确认密钥文件格式正确（PEM 格式）
- 检查参数编码是否为 UTF-8

#### 2. 支付页面无法跳转

**问题**: 点击支付后无法跳转到支付宝页面

**解决方案**:
- 检查支付宝应用ID是否正确
- 确认网关地址配置正确
- 查看应用日志中的错误信息

#### 3. 回调地址无法访问

**问题**: 支付宝无法访问回调地址

**解决方案**:
- 确保回调地址可以从外网访问
- 检查防火墙和安全组设置
- 使用内网穿透工具（开发环境）

#### 4. 端口被占用

**问题**: 启动时提示端口被占用

**解决方案**:
```bash
# 查看端口占用
lsof -i :3000

# 杀死占用进程
kill -9 <PID>

# 或者修改端口配置
export PORT=3001
```

#### 5. PM2 进程异常

**问题**: PM2 管理的进程频繁重启

**解决方案**:
```bash
# 查看 PM2 日志
pm2 logs alipay-payment

# 重置 PM2
pm2 delete all
pm2 start ecosystem.config.js --env production
```

### 调试技巧

1. **启用详细日志**
   ```bash
   export LOG_LEVEL=debug
   npm start
   ```

2. **使用沙箱环境测试**
   ```bash
   npm run start:sandbox
   ```

3. **检查支付宝开放平台日志**
   - 登录支付宝开放平台
   - 查看应用调用日志
   - 分析错误码和错误信息

## 安全注意事项

1. **密钥安全**
   - 私钥文件权限设置为 600
   - 不要将密钥提交到版本控制系统
   - 定期轮换密钥对

2. **环境隔离**
   - 生产环境和测试环境使用不同的应用
   - 严格控制生产环境访问权限

3. **网络安全**
   - 使用 HTTPS 协议
   - 配置防火墙规则
   - 启用请求频率限制

## 许可证

MIT License

## 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

## 支持

如有问题，请提交 Issue 或联系维护团队。