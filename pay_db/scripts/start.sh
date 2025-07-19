#!/bin/bash

# 支付宝支付系统启动脚本
# 使用方法: ./scripts/start.sh [environment]

set -e

ENVIRONMENT=${1:-development}
APP_NAME="alipay-payment"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

# 检查环境配置文件
check_env_file() {
    if [ ! -f ".env.${ENVIRONMENT}" ]; then
        error "环境配置文件 .env.${ENVIRONMENT} 不存在"
    fi
    
    # 创建符号链接
    ln -sf ".env.${ENVIRONMENT}" .env
    log "使用环境配置: .env.${ENVIRONMENT}"
}

# 检查密钥文件
check_keys() {
    if [ ! -d "keys" ]; then
        warn "keys 目录不存在，创建中..."
        mkdir -p keys
    fi
    
    # 检查必要的密钥文件（根据环境）
    if [ "$ENVIRONMENT" = "production" ]; then
        if [ ! -f "keys/production_private_key.pem" ]; then
            warn "生产环境私钥文件不存在: keys/production_private_key.pem"
        fi
        if [ ! -f "keys/production_public_key.pem" ]; then
            warn "生产环境公钥文件不存在: keys/production_public_key.pem"
        fi
    elif [ "$ENVIRONMENT" = "sandbox" ]; then
        if [ ! -f "keys/sandbox_private_key.pem" ]; then
            warn "沙箱环境私钥文件不存在: keys/sandbox_private_key.pem"
        fi
        if [ ! -f "keys/sandbox_public_key.pem" ]; then
            warn "沙箱环境公钥文件不存在: keys/sandbox_public_key.pem"
        fi
    fi
}

# 创建必要目录
create_directories() {
    log "创建必要目录..."
    mkdir -p logs
    mkdir -p data
    mkdir -p keys
}

# 安装依赖
install_dependencies() {
    if [ ! -d "node_modules" ]; then
        log "安装依赖..."
        npm install
    else
        log "依赖已存在，跳过安装"
    fi
}

# 启动应用
start_app() {
    log "启动应用 ($ENVIRONMENT 环境)..."
    
    case $ENVIRONMENT in
        "development")
            if command -v nodemon &> /dev/null; then
                log "使用 nodemon 启动开发环境..."
                npm run dev
            else
                log "nodemon 未安装，使用 node 启动..."
                npm start
            fi
            ;;
        "production")
            if command -v pm2 &> /dev/null; then
                log "使用 PM2 启动生产环境..."
                pm2 start ecosystem.config.js --env production
                pm2 logs $APP_NAME
            else
                log "PM2 未安装，使用 node 启动..."
                npm start
            fi
            ;;
        "sandbox"|"test")
            log "启动测试/沙箱环境..."
            npm start
            ;;
        *)
            error "不支持的环境: $ENVIRONMENT"
            ;;
    esac
}

# 主函数
main() {
    log "启动 $APP_NAME ($ENVIRONMENT 环境)..."
    
    create_directories
    check_env_file
    check_keys
    install_dependencies
    start_app
}

# 显示帮助信息
show_help() {
    echo "支付宝支付系统启动脚本"
    echo ""
    echo "使用方法:"
    echo "  $0 [environment]"
    echo ""
    echo "环境选项:"
    echo "  development  - 开发环境 (默认)"
    echo "  production   - 生产环境"
    echo "  sandbox      - 沙箱环境"
    echo "  test         - 测试环境"
    echo ""
    echo "示例:"
    echo "  $0                    # 启动开发环境"
    echo "  $0 production         # 启动生产环境"
    echo "  $0 sandbox           # 启动沙箱环境"
}

# 处理命令行参数
case "${1:-}" in
    -h|--help)
        show_help
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac