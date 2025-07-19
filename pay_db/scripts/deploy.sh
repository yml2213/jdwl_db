#!/bin/bash

# 支付宝支付系统部署脚本
# 使用方法: ./scripts/deploy.sh [environment]

set -e

# 默认环境为生产环境
ENVIRONMENT=${1:-production}
APP_NAME="alipay-payment"
APP_DIR="/opt/${APP_NAME}"
BACKUP_DIR="/opt/backups/${APP_NAME}"
LOG_FILE="/var/log/${APP_NAME}/deploy.log"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}" | tee -a "$LOG_FILE"
    exit 1
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}" | tee -a "$LOG_FILE"
}

# 检查是否为 root 用户
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "此脚本需要 root 权限运行"
    fi
}

# 检查系统依赖
check_dependencies() {
    log "检查系统依赖..."
    
    # 检查 Node.js
    if ! command -v node &> /dev/null; then
        error "Node.js 未安装，请先安装 Node.js 18+"
    fi
    
    # 检查 npm
    if ! command -v npm &> /dev/null; then
        error "npm 未安装"
    fi
    
    # 检查 PM2
    if ! command -v pm2 &> /dev/null; then
        log "安装 PM2..."
        npm install -g pm2
    fi
    
    log "系统依赖检查完成"
}

# 创建必要目录
create_directories() {
    log "创建应用目录..."
    mkdir -p "$APP_DIR"
    mkdir -p "$BACKUP_DIR"
    mkdir -p "/var/log/${APP_NAME}"
    mkdir -p "${APP_DIR}/logs"
    mkdir -p "${APP_DIR}/keys"
    mkdir -p "${APP_DIR}/data"
}

# 备份当前版本
backup_current() {
    if [ -d "$APP_DIR" ] && [ "$(ls -A $APP_DIR)" ]; then
        log "备份当前版本..."
        BACKUP_NAME="${APP_NAME}-$(date +%Y%m%d-%H%M%S)"
        cp -r "$APP_DIR" "${BACKUP_DIR}/${BACKUP_NAME}"
        log "备份完成: ${BACKUP_DIR}/${BACKUP_NAME}"
    fi
}

# 部署应用
deploy_app() {
    log "部署应用到 $APP_DIR..."
    
    # 复制文件
    cp -r ./* "$APP_DIR/"
    cd "$APP_DIR"
    
    # 安装依赖
    log "安装生产依赖..."
    npm ci --only=production
    
    # 设置权限
    chown -R www-data:www-data "$APP_DIR"
    chmod -R 755 "$APP_DIR"
    chmod 600 "${APP_DIR}/keys"/*
}

# 配置环境
setup_environment() {
    log "配置 $ENVIRONMENT 环境..."
    
    if [ ! -f "${APP_DIR}/.env.${ENVIRONMENT}" ]; then
        error "环境配置文件 .env.${ENVIRONMENT} 不存在"
    fi
    
    # 创建符号链接到主配置文件
    ln -sf ".env.${ENVIRONMENT}" "${APP_DIR}/.env"
    
    log "环境配置完成"
}

# 启动服务
start_service() {
    log "启动服务..."
    
    cd "$APP_DIR"
    
    # 停止现有进程
    pm2 delete "$APP_NAME" 2>/dev/null || true
    
    # 启动新进程
    pm2 start ecosystem.config.js --env "$ENVIRONMENT"
    pm2 save
    
    # 设置开机自启
    pm2 startup
    
    log "服务启动完成"
}

# 健康检查
health_check() {
    log "执行健康检查..."
    
    sleep 5
    
    for i in {1..10}; do
        if curl -f http://localhost:3000/health &>/dev/null; then
            log "健康检查通过"
            return 0
        fi
        warn "健康检查失败，重试 $i/10..."
        sleep 3
    done
    
    error "健康检查失败，部署可能存在问题"
}

# 主函数
main() {
    log "开始部署 $APP_NAME ($ENVIRONMENT 环境)..."
    
    check_root
    check_dependencies
    create_directories
    backup_current
    deploy_app
    setup_environment
    start_service
    health_check
    
    log "部署完成！"
    log "应用状态: $(pm2 status $APP_NAME)"
}

# 执行主函数
main "$@"