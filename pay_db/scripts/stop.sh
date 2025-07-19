#!/bin/bash

# 支付宝支付系统停止脚本

set -e

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
}

# 停止 PM2 进程
stop_pm2() {
    if command -v pm2 &> /dev/null; then
        log "停止 PM2 进程..."
        
        if pm2 list | grep -q "$APP_NAME"; then
            pm2 stop "$APP_NAME"
            pm2 delete "$APP_NAME"
            log "PM2 进程已停止"
        else
            warn "未找到 PM2 进程: $APP_NAME"
        fi
    else
        warn "PM2 未安装"
    fi
}

# 停止 Node.js 进程
stop_node() {
    log "查找并停止 Node.js 进程..."
    
    # 查找相关进程
    PIDS=$(pgrep -f "node.*index.js" || true)
    
    if [ -n "$PIDS" ]; then
        log "找到进程: $PIDS"
        echo "$PIDS" | xargs kill -TERM
        
        # 等待进程优雅关闭
        sleep 5
        
        # 强制杀死仍在运行的进程
        REMAINING_PIDS=$(pgrep -f "node.*index.js" || true)
        if [ -n "$REMAINING_PIDS" ]; then
            warn "强制停止进程: $REMAINING_PIDS"
            echo "$REMAINING_PIDS" | xargs kill -KILL
        fi
        
        log "Node.js 进程已停止"
    else
        warn "未找到运行中的 Node.js 进程"
    fi
}

# 停止 Docker 容器
stop_docker() {
    if command -v docker &> /dev/null; then
        log "停止 Docker 容器..."
        
        if docker ps | grep -q "$APP_NAME"; then
            docker stop "$APP_NAME" || true
            log "Docker 容器已停止"
        else
            warn "未找到运行中的 Docker 容器: $APP_NAME"
        fi
    else
        warn "Docker 未安装"
    fi
}

# 清理临时文件
cleanup() {
    log "清理临时文件..."
    
    # 清理 PID 文件
    if [ -f "/tmp/${APP_NAME}.pid" ]; then
        rm -f "/tmp/${APP_NAME}.pid"
    fi
    
    # 清理临时日志
    if [ -d "/tmp/${APP_NAME}_logs" ]; then
        rm -rf "/tmp/${APP_NAME}_logs"
    fi
    
    log "清理完成"
}

# 显示状态
show_status() {
    log "检查应用状态..."
    
    # 检查 PM2 状态
    if command -v pm2 &> /dev/null; then
        echo "PM2 状态:"
        pm2 status "$APP_NAME" 2>/dev/null || echo "  未找到 PM2 进程"
    fi
    
    # 检查 Node.js 进程
    echo "Node.js 进程:"
    pgrep -f "node.*index.js" || echo "  未找到 Node.js 进程"
    
    # 检查端口占用
    echo "端口占用情况:"
    netstat -tlnp | grep :3000 || echo "  端口 3000 未被占用"
}

# 主函数
main() {
    log "停止 $APP_NAME..."
    
    stop_pm2
    stop_node
    stop_docker
    cleanup
    
    log "应用已停止"
    echo ""
    show_status
}

# 显示帮助信息
show_help() {
    echo "支付宝支付系统停止脚本"
    echo ""
    echo "使用方法:"
    echo "  $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -h, --help     显示帮助信息"
    echo "  -s, --status   显示应用状态"
    echo ""
    echo "示例:"
    echo "  $0             # 停止应用"
    echo "  $0 --status    # 显示状态"
}

# 处理命令行参数
case "${1:-}" in
    -h|--help)
        show_help
        exit 0
        ;;
    -s|--status)
        show_status
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac