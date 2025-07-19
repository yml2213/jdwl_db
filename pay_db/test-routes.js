#!/usr/bin/env node

const http = require('http');

// 测试路由配置
async function testRoute(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Test-Client/1.0'
      }
    };

    if (data && method === 'POST') {
      const postData = new URLSearchParams(data).toString();
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (data && method === 'POST') {
      req.write(new URLSearchParams(data).toString());
    }

    req.end();
  });
}

async function runTests() {
  console.log('开始测试路由配置...\n');

  try {
    // 测试根路径
    console.log('1. 测试根路径 (/)');
    const rootResponse = await testRoute('/');
    console.log(`   状态码: ${rootResponse.statusCode}`);
    console.log(`   重定向到: ${rootResponse.headers.location || '无重定向'}\n`);

    // 测试支付页面
    console.log('2. 测试支付页面 (/payment)');
    const paymentResponse = await testRoute('/payment');
    console.log(`   状态码: ${paymentResponse.statusCode}`);
    console.log(`   内容类型: ${paymentResponse.headers['content-type'] || '未知'}\n`);

    // 测试支付发起
    console.log('3. 测试支付发起 (/payment/initiate)');
    const initiateData = {
      outTradeNo: 'TEST_ORDER_001',
      subject: '测试商品',
      totalAmount: '0.01',
      body: '这是一个测试商品'
    };
    const initiateResponse = await testRoute('/payment/initiate', 'POST', initiateData);
    console.log(`   状态码: ${initiateResponse.statusCode}`);
    console.log(`   重定向到: ${initiateResponse.headers.location || '无重定向'}\n`);

    // 测试健康检查
    console.log('4. 测试健康检查 (/health)');
    const healthResponse = await testRoute('/health');
    console.log(`   状态码: ${healthResponse.statusCode}`);
    if (healthResponse.statusCode === 200) {
      const healthData = JSON.parse(healthResponse.body);
      console.log(`   状态: ${healthData.status}`);
      console.log(`   环境: ${healthData.environment}\n`);
    }

    // 测试不存在的路由
    console.log('5. 测试不存在的路由 (/pay)');
    const notFoundResponse = await testRoute('/pay', 'POST', { test: 'data' });
    console.log(`   状态码: ${notFoundResponse.statusCode}`);
    if (notFoundResponse.statusCode === 404) {
      console.log('   ✅ 正确返回404错误\n');
    }

    console.log('✅ 所有路由测试完成！');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.log('\n请确保服务器正在运行 (npm run dev)');
  }
}

// 运行测试
runTests();