export default {
    name: 'disableStoreProducts',
    description: '停用店铺商品',
    execute: async (context, sessionData, cancellationToken) => {
        const { updateFn } = context
        updateFn({ message: '任务 [停用店铺商品] - 框架占位符，待实现. ' })

        //
        // 在这里添加您的API调用和业务逻辑
        //
        // 示例:
        // const result = await someApiService.disableProducts(context.skus, context.store);
        // if (!result.success) {
        //   return { success: false, message: result.errorMessage };
        // }
        //

        await new Promise((resolve) => setTimeout(resolve, 1000)) // 模拟网络延迟

        updateFn({ message: '框架任务执行完毕' })

        return { success: true, message: '停用店铺商品 - 框架执行成功' }
    }
} 