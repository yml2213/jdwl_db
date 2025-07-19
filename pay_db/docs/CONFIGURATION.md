# 配置说明文档

## 概述

本文档详细说明了支付宝网页支付系统的所有配置选项，包括环境变量、支付宝应用配置、部署配置等。

## 环境变量配置

### 基础服务配置

| 变量名 | 描述 | 类型 | 默认值 | 必填 | 示例 |
|--------|------|------|--------|------|------|
| `NODE_ENV` | Node.js 运行环境 | string | development | 否 | production |
| `PORT` | 服务监听端口 | number | 3000 | 否 | 8080 |
| `HOST` | 服务监听主机 | string | localhost | 否 | 0.0.0.0 |
| `TRUST_PROXY` | 是否信任代理 | boolean | false | 否 | true |

### 支付环境配置

| 变量名 | 描述 | 类型 | 默认值 | 必填 | 示例 |
|--------|------|------|--------|------|------|
| `PAYMENT_ENV` | 支付环境 | string | sandbox | 是 | production |

**支付环境选项:**
- `sandbox`: 沙箱环境，用于开发测试
- `production`: 生产环境，用于正式交易

### 支付宝应用配置

#### 沙箱环境配置

| 变量名 | 描述 | 类型 | 必填 | 示例 |
|--------|------|------|------|------|
| `ALIPAY_SANDBOX_APP_ID` | 沙箱应用ID | string | 是 | 9021000122671080 |
| `ALIPAY_SANDBOX_PRIVATE_KEY_PATH` | 沙箱应用私钥路径 | string | 是 | ./keys/sandbox_private_key.pem |
| `ALIPAY_SANDBOX_PUBLIC_KEY_PATH` | 沙箱支付宝公钥路径 | string | 是 | ./keys/sandbox_public_key.pem |

#### 生产环境配置

| 变量名 | 描述 | 类型 | 必填 | 示例 |
|--------|------|------|------|------|
| `ALIPAY_APP_ID` | 生产应用ID | string | 是 | 2021000000000000 |
| `ALIPAY_PRIVATE_KEY_PATH` | 生产应用私钥路径 | string | 是 | ./keys/production_private_key.pem |
| `ALIPAY_PUBLIC_KEY_PATH` | 生产支付宝公钥路径 | string | 是 | ./keys/production_public_key.pem |

### 网关和回调配置

| 变量名 | 描述 | 类型 | 必填 | 示例 |
|--------|------|------|------|------|
| `ALIPAY_GATEWAY_URL` | 支付宝网关地址 | string | 是 | https://openapi.alipay.com/gateway.do |
| `NOTIFY_URL` | 异步通知地址 | string | 是 | https://your-domain.com/alipay/notify |
| `RETURN_URL` | 同步返回地址 | string | 是 | https://your-domain.com/alipay/return |

**网关地址说明:**
- 沙箱环境: `https://openapi-sandbox.alipay.com/gateway.do`
- 生产环境: `https://openapi.alipay.com/gateway.do`

### 安全配置

| 变量名 | 描述 | 类型 | 默认值 | 必填 | 示例 |
|--------|------|------|--------|------|------|
| `RATE_LIMIT_WINDOW_MS` | 限流时间窗口(毫秒) | number | 900000 | 否 | 900000 |
| `RATE_LIMIT_MAX_REQUESTS` | 时间窗口内最大请求数 | number | 100 | 否 | 200 |
| `CORS_ORIGIN` | CORS 允许的源 | string | * | 否 | https://your-domain.com |

### 日志配置

| 变量名 | 描述 | 类型 | 默认值 | 必填 | 示例 |
|--------|------|------|--------|------|------|
| `LOG_LEVEL` | 日志级别 | string | info | 否 | debug |
| `LOG_FILE` | 日志文件路径 | string | ./logs/combined.log | 否 | /var/log/app.log |
| `LOG_MAX_SIZE` | 日志文件最大大小 | string | 10m | 否 | 20m |
| `LOG_MAX_FILES` | 保留的日志文件数量 | number | 5 | 否 | 10 |

**日志级别说明:**
- `error`: 仅错误信息
- `warn`: 警告和错误信息
- `info`: 一般信息、警告和错误
- `debug`: 调试信息（包含所有级别）

### 监控配置

| 变量名 | 描述 | 类型 | 默认值 | 必填 | 示例 |
|--------|------|------|--------|------|------|
| `HEALTH_CHECK_ENABLED` | 是否启用健康检查 | boolean | true | 否 | false |
| `METRICS_ENABLED` | 是否启用指标收集 | boolean | true | 否 | false |

### SSL 配置（可选）

| 变量名 | 描述 | 类型 | 必填 | 示例 |
|--------|------|------|------|------|
| `SSL_CERT_PATH` | SSL 证书路径 | string | 否 | ./ssl/cert.pem |
| `SSL_KEY_PATH` | SSL 私钥路径 | string | 否 | ./ssl/key.pem |

## 配置文件示例

### 开发环境配置 (.env.development)

```bash
# 服务器配置
NODE_ENV=development
PORT=3000
HOST=localhost

# 支付环境
PAYMENT_ENV=sandbox

# 沙箱支付宝配置
ALIPAY_SANDBOX_APP_ID=9021000122671080
ALIPAY_SANDBOX_PRIVATE_KEY_PATH=./keys/sandbox_private_key.pem
ALIPAY_SANDBOX_PUBLIC_KEY_PATH=./keys/sandbox_public_key.pem
ALIPAY_GATEWAY_URL=https://openapi-sandbox.alipay.com/gateway.do

# 回调地址（开发环境）
NOTIFY_URL=http://localhost:3000/alipay/notify
RETURN_URL=http://localhost:3000/alipay/return

# 日志配置
LOG_LEVEL=debug
LOG_FILE=./logs/development.log

# 安全配置
CORS_ORIGIN=*
RATE_LIMIT_MAX_REQUESTS=1000
```

### 生产环境配置 (.env.production)

```bash
# 服务器配置
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# 支付环境
PAYMENT_ENV=production

# 生产支付宝配置
ALIPAY_APP_ID=your_production_app_id
ALIPAY_PRIVATE_KEY_PATH=./keys/production_private_key.pem
ALIPAY_PUBLIC_KEY_PATH=./keys/production_public_key.pem
ALIPAY_GATEWAY_URL=https://openapi.alipay.com/gateway.do

# 回调地址（生产环境）
NOTIFY_URL=https://your-domain.com/alipay/notify
RETURN_URL=https://your-domain.com/alipay/return

# 安全配置
TRUST_PROXY=true
CORS_ORIGIN=https://your-domain.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# 日志配置
LOG_LEVEL=info
LOG_FILE=./logs/production.log
LOG_MAX_SIZE=10m
LOG_MAX_FILES=5

# 监控配置
HEALTH_CHECK_ENABLED=true
METRICS_ENABLED=true

# SSL 配置
SSL_CERT_PATH=./ssl/cert.pem
SSL_KEY_PATH=./ssl/key.pem
```

## 支付宝应用配置

### 1. 创建支付宝应用

#### 沙箱应用

1. 访问 [支付宝开放平台](https://open.alipay.com/)
2. 登录开发者账号
3. 进入"开发者中心" -> "沙箱应用"
4. 获取沙箱应用信息：
   - 应用ID (APPID)
   - 应用私钥
   - 支付宝公钥

#### 正式应用

1. 在支付宝开放平台创建应用
2. 配置应用基本信息
3. 添加功能包：手机网站支付
4. 配置密钥和回调地址
5. 提交审核并上线

### 2. 密钥配置

#### 生成应用密钥对

```bash
# 生成私钥
openssl genrsa -out app_private_key.pem 2048

# 生成公钥
openssl rsa -in app_private_key.pem -pubout -out app_public_key.pem
```

#### 密钥文件格式

**应用私钥 (app_private_key.pem):**
```
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
-----END PRIVATE KEY-----
```

**支付宝公钥 (alipay_public_key.pem):**
```
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----
```

### 3. 回调地址配置

#### 异步通知地址 (notify_url)

- **用途**: 接收支付结果通知
- **要求**: 必须是公网可访问的 HTTPS 地址
- **示例**: `https://your-domain.com/alipay/notify`

#### 同步返回地址 (return_url)

- **用途**: 支付完成后页面跳转
- **要求**: 必须是公网可访问的 HTTPS 地址
- **示例**: `https://your-domain.com/alipay/return`

## PM2 配置

### ecosystem.config.js 配置说明

```javascript
module.exports = {
  apps: [
    {
      name: 'alipay-payment',           // 应用名称
      script: 'index.js',              // 启动脚本
      instances: 'max',                // 实例数量（max = CPU核心数）
      exec_mode: 'cluster',            // 执行模式
      
      // 环境变量
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        PAYMENT_ENV: 'production'
      },
      
      // 内存限制
      max_memory_restart: '500M',      // 内存超过500M时重启
      
      // 重启配置
      min_uptime: '10s',               // 最小运行时间
      max_restarts: 10,                // 最大重启次数
      restart_delay: 4000,             // 重启延迟
      
      // 日志配置
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // 监控配置
      watch: false,                    // 是否监听文件变化
      ignore_watch: ['node_modules', 'logs', 'data'],
      
      // 其他配置
      autorestart: true,               // 自动重启
      merge_logs: true,                // 合并日志
      time: true                       // 日志时间戳
    }
  ]
};
```

## Docker 配置

### Dockerfile 配置说明

```dockerfile
# 基础镜像
FROM node:18-alpine

# 工作目录
WORKDIR /app

# 复制依赖文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production && npm cache clean --force

# 复制应用代码
COPY . .

# 创建必要目录
RUN mkdir -p logs keys data

# 设置权限
RUN chown -R node:node /app
USER node

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# 启动命令
CMD ["npm", "start"]
```

### docker-compose.yml 配置说明

```yaml
version: '3.8'

services:
  alipay-payment:
    build: .
    container_name: alipay-payment-app
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env.production
    volumes:
      - ./logs:/app/logs          # 日志目录挂载
      - ./keys:/app/keys:ro       # 密钥目录挂载（只读）
      - ./data:/app/data          # 数据目录挂载
    networks:
      - alipay-network
    depends_on:
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  redis:
    image: redis:7-alpine
    container_name: alipay-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - alipay-network
    command: redis-server --appendonly yes

volumes:
  redis_data:

networks:
  alipay-network:
    driver: bridge
```

## Nginx 配置

### nginx.conf 配置说明

```nginx
events {
    worker_connections 1024;
}

http {
    upstream alipay_backend {
        server alipay-payment:3000;
    }

    # 安全配置
    client_max_body_size 1M;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    server {
        listen 80;
        server_name your-domain.com;
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name your-domain.com;

        # SSL 配置
        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;

        # 代理配置
        location / {
            proxy_pass http://alipay_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }

        # 健康检查
        location /health {
            proxy_pass http://alipay_backend/health;
            access_log off;
        }

        # 静态文件缓存
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            proxy_pass http://alipay_backend;
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}
```

## 配置验证

### 环境变量验证脚本

```bash
#!/bin/bash

# 验证必需的环境变量
check_env_var() {
    if [ -z "${!1}" ]; then
        echo "错误: 环境变量 $1 未设置"
        exit 1
    else
        echo "✓ $1 已设置"
    fi
}

echo "验证环境变量配置..."

# 基础配置
check_env_var "PAYMENT_ENV"
check_env_var "ALIPAY_APP_ID"
check_env_var "ALIPAY_PRIVATE_KEY_PATH"
check_env_var "ALIPAY_PUBLIC_KEY_PATH"
check_env_var "ALIPAY_GATEWAY_URL"
check_env_var "NOTIFY_URL"
check_env_var "RETURN_URL"

echo "所有必需的环境变量都已正确设置！"
```

### 密钥文件验证

```bash
#!/bin/bash

# 验证密钥文件
check_key_file() {
    if [ ! -f "$1" ]; then
        echo "错误: 密钥文件 $1 不存在"
        exit 1
    else
        echo "✓ 密钥文件 $1 存在"
    fi
}

echo "验证密钥文件..."

check_key_file "$ALIPAY_PRIVATE_KEY_PATH"
check_key_file "$ALIPAY_PUBLIC_KEY_PATH"

echo "所有密钥文件都已正确配置！"
```

## 配置最佳实践

### 1. 安全性

- 使用环境变量存储敏感信息
- 密钥文件权限设置为 600
- 定期轮换密钥对
- 使用 HTTPS 协议

### 2. 性能优化

- 合理设置 PM2 实例数量
- 配置适当的内存限制
- 启用 Nginx 缓存
- 使用 Redis 缓存会话

### 3. 监控和日志

- 配置结构化日志
- 设置日志轮转
- 启用健康检查
- 配置监控告警

### 4. 环境隔离

- 不同环境使用不同的配置文件
- 生产环境和测试环境完全隔离
- 使用不同的支付宝应用

## 故障排除

### 常见配置问题

1. **环境变量未生效**
   - 检查 .env 文件是否存在
   - 确认环境变量名称正确
   - 重启应用服务

2. **密钥文件读取失败**
   - 检查文件路径是否正确
   - 确认文件权限设置
   - 验证文件格式

3. **回调地址无法访问**
   - 确保地址可从公网访问
   - 检查防火墙设置
   - 验证 HTTPS 证书

4. **PM2 进程异常**
   - 检查 ecosystem.config.js 配置
   - 查看 PM2 日志
   - 验证内存和 CPU 限制