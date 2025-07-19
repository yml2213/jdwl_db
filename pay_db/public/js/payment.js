document.addEventListener('DOMContentLoaded', function () {
    console.log('页面加载完成，JavaScript正常运行');

    document.getElementById('paymentForm').addEventListener('submit', function (e) {
        const button = document.getElementById('payBtn');
        const orderNoInput = document.getElementById('orderNo');

        // 防止重复提交
        if (button.disabled) {
            console.log('防止重复提交');
            e.preventDefault();
            return;
        }

        // 生成唯一订单号
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        const newOrderNo = `ORDER_${timestamp}_${random}`;
        orderNoInput.value = newOrderNo;

        console.log('生成新订单号:', newOrderNo);

        // 显示加载状态
        button.disabled = true;
        button.textContent = '处理中...';
        button.style.backgroundColor = '#ccc';

        // 如果10秒后还没跳转，恢复按钮状态
        setTimeout(() => {
            if (button.disabled) {
                button.disabled = false;
                button.textContent = '立即支付';
                button.style.backgroundColor = '#1677ff';
                console.log('按钮状态已恢复');
            }
        }, 10000);
    });
});