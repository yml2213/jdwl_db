module.exports = {
  apps: [
    {
      name: 'alipay-payment',
      script: 'index.js',
      instances: 'max', // 使用所有 CPU 核心
      exec_mode: 'cluster',
      
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
      
      env_sandbox: {
        NODE_ENV: 'test',
        PORT: 3000,
        PAYMENT_ENV: 'sandbox'
      },
      
      // 日志配置
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // 进程管理
      max_memory_restart: '500M',
      min_uptime: '10s',
      max_restarts: 10,
      
      // 监控配置
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'data'],
      
      // 自动重启配置
      autorestart: true,
      restart_delay: 4000,
      
      // 健康检查
      health_check_grace_period: 3000,
      
      // 集群配置
      kill_timeout: 5000,
      listen_timeout: 3000,
      
      // 其他配置
      merge_logs: true,
      time: true
    }
  ],
  
  // 部署配置
  deploy: {
    production: {
      user: 'www-data',
      host: ['your-server-ip'],
      ref: 'origin/main',
      repo: 'git@github.com:your-username/alipay-payment.git',
      path: '/opt/alipay-payment',
      'post-deploy': 'npm install --production && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'apt update && apt install git -y'
    },
    
    staging: {
      user: 'www-data',
      host: ['your-staging-server-ip'],
      ref: 'origin/develop',
      repo: 'git@github.com:your-username/alipay-payment.git',
      path: '/opt/alipay-payment-staging',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env staging'
    }
  }
};