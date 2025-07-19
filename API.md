# API 接口文档

## 概述

支付宝网页支付集成系统提供了完整的 RESTful API 接口，支持支付订单创建、状态查询、回调处理、用户订阅管理等功能。

## 基础信息

- **Base URL**: `http://localhost:3000` (开发环境)
- **Content-Type**: `application/json` 或 `application/x-www-form-urlencoded`
- **字符编码**: UTF-8

## 认证

目前系统不需要特殊认证，但建议在生产环境中添加适当的认证机制。

## 通用响应格式

### 成功响应
```json
{
  "success": true,
  "data": {
    // 具体数据
  }
}
```

### 错误响应
```json
{
  "success": false,
  "message": "错误描述",
  "error": "详细错误信息"
}
```

## 支付相关接口

### 1. 显示支付页面

**GET** `/payment`

显示支付页面，用户可以在此页面输入支付信息。

**查询参数:**
| 参数 | 类型 | 必填 | 描述 | 默认值 |
|------|------|------|------|--------|
| `outTradeNo` | string | 否 | 预填充的订单号 | 自动生成 |
| `subject` | string | 否 | 预填充的商品标题 | "商品-测试" |
| `totalAmount` | string | 否 | 预填充的支付金额 | "0.01" |
| `body` | string | 否 | 预填充的商品描述 | 默认描述 |

**响应:**
返回 HTML 支付页面

**示例:**
```bash
curl "http://localhost:3000/payment?subject=测试商品&totalAmount=0.01"
```

### 2. 创建支付订单

**POST** `/payment/create`

创建支付订单并生成支付宝支付链接。

**请求体:**
```json
{
  "outTradeNo": "ORDER_20240101001",
  "subject": "商品标题",
  "totalAmount": "0.01",
  "body": "商品描述"
}
```

**请求参数说明:**
| 参数 | 类型 | 必填 | 描述 | 限制 |
|------|------|------|------|------|
| `outTradeNo` | string | 是 | 商户订单号 | 6-64位字母数字下划线，唯一 |
| `subject` | string | 是 | 商品标题 | 1-256字符 |
| `totalAmount` | string | 是 | 支付金额 | 0.01-100000.00 |
| `body` | string | 否 | 商品描述 | 最大400字符 |

**成功响应:**
直接重定向到支付宝支付页面

**错误响应:**
```json
{
  "success": false,
  "message": "参数错误描述"
}
```

**示例:**
```bash
curl -X POST http://localhost:3000/payment/create \
  -H "Content-Type: application/json" \
  -d '{
    "outTradeNo": "ORDER_20240101001",
    "subject": "测试商品",
    "totalAmount": "0.01",
    "body": "这是一个测试商品"
  }'
```

### 3. 发起支付（表单提交）

**POST** `/payment/initiate`

通过表单提交方式发起支付，与 `/payment/create` 功能相同。

**请求体 (form-data):**
```
outTradeNo=ORDER_20240101001
subject=测试商品
totalAmount=0.01
body=商品描述
```

**响应:**
直接重定向到支付宝支付页面

### 4. 查询支付状态

**GET** `/payment/status/:orderId`

查询指定订单的支付状态。

**路径参数:**
| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `orderId` | string | 是 | 商户订单号 |

**成功响应:**
```json
{
  "success": true,
  "order": {
    "id": "order_internal_id",
    "outTradeNo": "ORDER_20240101001",
    "status": "paid",
    "tradeNo": "2024010122001234567890",
    "totalAmount": "0.01",
    "subject": "测试商品",
    "body": "商品描述",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:05:00.000Z"
  }
}
```

**订单状态说明:**
- `pending`: 待支付
- `paid`: 已支付
- `failed`: 支付失败
- `cancelled`: 已取消

**示例:**
```bash
curl http://localhost:3000/payment/status/ORDER_20240101001
```

## 支付宝回调接口

### 1. 异步通知接口

**POST** `/payment/alipay/notify`

支付宝服务器调用此接口发送支付结果通知。

**注意:** 此接口由支付宝服务器调用，不需要手动调用。

**请求体:** 支付宝发送的表单数据，包含以下关键参数：
- `out_trade_no`: 商户订单号
- `trade_no`: 支付宝交易号
- `trade_status`: 交易状态
- `total_amount`: 交易金额
- `sign`: 签名

**响应:** 
- 成功: `success`
- 失败: `failure`

### 2. 同步返回接口

**GET** `/payment/alipay/return`

用户支付完成后，支付宝页面跳转到此接口。

**查询参数:** 支付宝返回的参数，包含：
- `out_trade_no`: 商户订单号
- `trade_no`: 支付宝交易号
- `trade_status`: 交易状态
- `total_amount`: 交易金额
- `sign`: 签名

**响应:** 返回支付结果页面（HTML）

## 用户订阅管理接口

### 1. 创建订单页面

**GET** `/CreateOrder`

根据用户订阅状态创建订单或显示用户信息。

**查询参数:**
| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `uniqueKey` | string | 是 | 用户唯一标识 |
| `Timestamp` | number | 否 | 时间戳 |
| `extend` | string | 否 | 是否强制续费 ("true") |

**响应:**
- 新用户或订阅过期：返回支付页面 HTML
- 订阅有效且未要求续费：返回用户信息页面 HTML
- 订阅有效但要求续费：返回续费页面 HTML

**示例:**
```bash
# 新用户或订阅过期
curl "http://localhost:3000/CreateOrder?uniqueKey=user123"

# 强制续费
curl "http://localhost:3000/CreateOrder?uniqueKey=user123&extend=true"
```

### 2. 查询用户订阅状态

**GET** `/subscription/status`

查询指定用户的订阅状态和详细信息。

**查询参数:**
| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `uniqueKey` | string | 是 | 用户唯一标识 |

**成功响应:**
```json
{
  "success": true,
  "data": {
    "uniqueKey": "user123",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "createdAtFormatted": "2024年1月1日 00:00:00",
    "currentStatus": {
      "isValid": true,
      "message": "订阅有效",
      "validUntil": "2024-02-01T00:00:00.000Z"
    },
    "subscriptions": [
      {
        "id": "sub_123",
        "amount": 300,
        "duration": 1,
        "status": "active",
        "startTime": "2024-01-01T00:00:00.000Z",
        "validUntil": "2024-02-01T00:00:00.000Z",
        "outTradeNo": "ORDER_20240101001"
      }
    ],
    "validUntilFormatted": "2024年2月1日 00:00:00"
  }
}
```

**示例:**
```bash
curl "http://localhost:3000/subscription/status?uniqueKey=user123"
```

### 3. 获取统计信息

**GET** `/subscription/statistics`

获取系统的用户和订阅统计信息。

**成功响应:**
```json
{
  "success": true,
  "data": {
    "totalUsers": 100,
    "activeSubscriptions": 80,
    "totalRevenue": 24000,
    "newUsersToday": 5,
    "subscriptionsToday": 8
  }
}
```

**示例:**
```bash
curl http://localhost:3000/subscription/statistics
```

## 系统接口

### 1. 健康检查

**GET** `/health`

检查系统运行状态。

**成功响应:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "environment": "development",
  "paymentEnv": "sandbox",
  "uptime": 3600,
  "memory": {
    "rss": 50331648,
    "heapTotal": 20971520,
    "heapUsed": 15728640,
    "external": 1048576
  },
  "version": "1.0.0"
}
```

**示例:**
```bash
curl http://localhost:3000/health
```

### 2. API 信息

**GET** `/api/info`

获取 API 基本信息。

**成功响应:**
```json
{
  "name": "Alipay Web Payment API",
  "version": "1.0.0",
  "description": "支付宝网页支付集成服务",
  "environment": "development",
  "paymentEnv": "sandbox",
  "endpoints": {
    "payment": "/payment",
    "health": "/health",
    "static": "/static",
    "logs": "/logs"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**示例:**
```bash
curl http://localhost:3000/api/info
```

### 3. 根路径

**GET** `/`

根路径会自动重定向到支付页面。

**响应:** 重定向到 `/payment`

## 错误码说明

| HTTP状态码 | 描述 | 常见原因 |
|------------|------|----------|
| 400 | 请求参数错误 | 缺少必填参数、参数格式错误、金额无效等 |
| 404 | 资源不存在 | 订单不存在、用户不存在、路由不存在 |
| 409 | 资源冲突 | 订单号重复 |
| 500 | 服务器内部错误 | 系统异常、支付宝接口调用失败等 |

## 业务错误信息

| 错误信息 | 描述 | 解决方案 |
|----------|------|----------|
| "缺少必填参数" | 请求缺少必要参数 | 检查请求参数完整性 |
| "订单号格式无效" | 订单号不符合规范 | 使用6-64位字母数字下划线组合 |
| "支付金额无效" | 金额超出范围或格式错误 | 确保金额在0.01-100000之间 |
| "订单号已存在" | 重复的订单号 | 使用唯一的订单号 |
| "签名验证失败" | 支付宝回调签名错误 | 检查密钥配置 |
| "用户不存在" | 查询的用户不存在 | 确认用户标识正确 |

## 测试示例

### 完整支付流程测试

```bash
# 1. 访问支付页面
curl http://localhost:3000/payment

# 2. 创建支付订单
curl -X POST http://localhost:3000/payment/create \
  -H "Content-Type: application/json" \
  -d '{
    "outTradeNo": "TEST_ORDER_001",
    "subject": "测试商品",
    "totalAmount": "0.01",
    "body": "API测试订单"
  }'

# 3. 查询订单状态
curl http://localhost:3000/payment/status/TEST_ORDER_001

# 4. 检查系统健康状态
curl http://localhost:3000/health
```

### 用户订阅流程测试

```bash
# 1. 创建新用户订单
curl "http://localhost:3000/CreateOrder?uniqueKey=testuser001"

# 2. 查询用户订阅状态
curl "http://localhost:3000/subscription/status?uniqueKey=testuser001"

# 3. 获取系统统计信息
curl http://localhost:3000/subscription/statistics
```

### 使用 Postman 测试

导入以下 Postman Collection:

```json
{
  "info": {
    "name": "Alipay Payment API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Payment",
      "item": [
        {
          "name": "Show Payment Page",
          "request": {
            "method": "GET",
            "header": [],
            "url": {
              "raw": "{{baseUrl}}/payment?subject=测试商品&totalAmount=0.01",
              "host": ["{{baseUrl}}"],
              "path": ["payment"],
              "query": [
                {"key": "subject", "value": "测试商品"},
                {"key": "totalAmount", "value": "0.01"}
              ]
            }
          }
        },
        {
          "name": "Create Payment",
          "request": {
            "method": "POST",
            "header": [
              {"key": "Content-Type", "value": "application/json"}
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"outTradeNo\": \"TEST_ORDER_001\",\n  \"subject\": \"测试商品\",\n  \"totalAmount\": \"0.01\",\n  \"body\": \"测试订单描述\"\n}"
            },
            "url": {
              "raw": "{{baseUrl}}/payment/create",
              "host": ["{{baseUrl}}"],
              "path": ["payment", "create"]
            }
          }
        },
        {
          "name": "Get Payment Status",
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{baseUrl}}/payment/status/{{orderId}}",
              "host": ["{{baseUrl}}"],
              "path": ["payment", "status", "{{orderId}}"]
            }
          }
        }
      ]
    },
    {
      "name": "Subscription",
      "item": [
        {
          "name": "Create Order",
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{baseUrl}}/CreateOrder?uniqueKey={{uniqueKey}}",
              "host": ["{{baseUrl}}"],
              "path": ["CreateOrder"],
              "query": [
                {"key": "uniqueKey", "value": "{{uniqueKey}}"}
              ]
            }
          }
        },
        {
          "name": "Get Subscription Status",
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{baseUrl}}/subscription/status?uniqueKey={{uniqueKey}}",
              "host": ["{{baseUrl}}"],
              "path": ["subscription", "status"],
              "query": [
                {"key": "uniqueKey", "value": "{{uniqueKey}}"}
              ]
            }
          }
        },
        {
          "name": "Get Statistics",
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{baseUrl}}/subscription/statistics",
              "host": ["{{baseUrl}}"],
              "path": ["subscription", "statistics"]
            }
          }
        }
      ]
    },
    {
      "name": "System",
      "item": [
        {
          "name": "Health Check",
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{baseUrl}}/health",
              "host": ["{{baseUrl}}"],
              "path": ["health"]
            }
          }
        },
        {
          "name": "API Info",
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{baseUrl}}/api/info",
              "host": ["{{baseUrl}}"],
              "path": ["api", "info"]
            }
          }
        }
      ]
    }
  ],
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:3000"
    },
    {
      "key": "uniqueKey",
      "value": "testuser001"
    },
    {
      "key": "orderId",
      "value": "TEST_ORDER_001"
    }
  ]
}
```

## 限制和注意事项

1. **请求频率限制**: 建议每秒不超过 10 次请求
2. **金额限制**: 支付金额范围 0.01-100000.00 元
3. **字符编码**: 所有请求必须使用 UTF-8 编码
4. **订单号唯一性**: 商户订单号在系统中必须唯一
5. **回调验证**: 所有支付宝回调都会进行签名验证
6. **超时设置**: 支付订单默认超时时间为 30 分钟
7. **用户标识**: 订阅系统中的 uniqueKey 应保持唯一性
8. **订阅时长**: 默认订阅时长为 1 个月，金额为 300 元

## 更新日志

### v1.0.0 (2024-01-01)
- 初始版本发布
- 支持基础支付功能
- 支持沙箱和生产环境
- 完整的错误处理机制
- 用户订阅管理功能
- 支付宝回调处理
- 系统监控和健康检查