/**
 * 高级工作流编排器 "Super Orchestrator"
 *
 * 该编排器负责执行一个基于阶段（stages）和数据源（source）依赖的复杂工作流。
 * 它以SKU为中心，追踪每个SKU的生命周期，并支持任务的并行执行和批次级流水线处理。
 */

/**
 * 初始化每个SKU的生命周期追踪对象。
 * @param {string[]} skus - 初始SKU列表。
 * @returns {object} - SKU生命周期集合。
 */
function initializeSkuLifecycles(skus) {
    const lifecycles = {};
    for (const sku of skus) {
        lifecycles[sku] = {
            sku: sku,
            status: 'pending', // pending, in_progress, completed, failed
            data: { sku: sku }, // 该SKU在整个流程中积累的数据
            completedTasks: new Set(), // 已成功完成的任务名
            logs: [] // 该SKU相关的日志
        };
    }
    return lifecycles;
}

/**
 * 执行一个由多个阶段组成的工作流。
 *
 * @param {object} options - 执行选项。
 * @param {object[]} options.stages - 工作流的阶段定义。
 * @param {object} options.taskHandlers - 任务处理器模块的字典。
 * @param {object} options.initialContext - 初始上下文，必须包含 skus 数组。
 * @param {Function} options.updateFn - 向前端发送状态更新的回调函数。
 * @param {object} options.sessionData - 用户会话数据。
 * @param {object} options.cancellationToken - 任务取消令牌。
 * @returns {Promise<object>} 最终执行结果 { success, message, data }。
 */
export async function executeWorkflow({
    stages,
    taskHandlers,
    initialContext,
    updateFn,
    sessionData,
    cancellationToken
}) {
    if (!initialContext.skus || !Array.isArray(initialContext.skus)) {
        throw new Error('initialContext 必须包含一个 SKU 数组 (skus)。');
    }

    const skuLifecycles = initializeSkuLifecycles(initialContext.skus);
    const allSkus = Object.values(skuLifecycles);

    // 主循环，按顺序执行每个阶段
    for (let i = 0; i < stages.length; i++) {
        if (!cancellationToken.value) {
            updateFn({ message: '工作流被用户取消。', type: 'warn' });
            return { success: false, message: '工作流已取消。' };
        }

        const stage = stages[i];
        updateFn({ message: `--- [阶段 ${i + 1}/${stages.length}]：${stage.name} ---`, type: 'info', stage: true });

        // 按 `source` 对当前阶段的任务进行分组，以便并行处理
        const tasksBySource = stage.tasks.reduce((acc, task) => {
            const source = task.source || 'initial';
            if (!acc[source]) acc[source] = [];
            acc[source].push(task);
            return acc;
        }, {});

        // 存储当前阶段所有任务的执行Promise
        const stagePromises = [];

        // 遍历所有数据源，为每个数据源启动对应的任务
        for (const source in tasksBySource) {
            // 筛选出符合当前数据源要求的SKU
            // 'initial' 源处理所有SKU，其他源处理已完成前置任务的SKU
            const skusForSource =
                source === 'initial'
                    ? allSkus
                    : allSkus.filter((sku) => sku.completedTasks.has(source));

            // 如果不是整店模式且没有SKU，则跳过
            if (initialContext.scope !== 'whole_store' && skusForSource.length === 0) {
                updateFn({
                    message: `阶段 ${i + 1}, 数据源 '${source}': 没有需要处理的SKU，跳过。`,
                    type: 'info',
                    debug: true
                });
                continue;
            }

            // 获取当前数据源要执行的所有任务
            const tasksToRun = tasksBySource[source];

            // 为这组SKU并行执行所有任务
            for (const taskInfo of tasksToRun) {
                const handler = taskHandlers[taskInfo.name];
                if (!handler || typeof handler.execute !== 'function') {
                    const errorMsg = `未找到任务处理器: ${taskInfo.name}`;
                    updateFn({ message: errorMsg, type: 'error' });
                    return { success: false, message: errorMsg };
                }

                updateFn({
                    message: `[${handler.description || taskInfo.name}] 准备处理 ${skusForSource.length} 个SKU...`,
                    type: 'info'
                });

                // 为每个任务创建一个执行Promise
                const taskPromise = handler
                    .execute(
                        {
                            // 传递给任务执行器的上下文
                            ...initialContext,
                            ...taskInfo.context, // 修正：合并任务特定的上下文
                            // 注意：这里传递的是筛选后的SKU生命周期对象列表
                            skus: skusForSource,
                            updateFn
                        },
                        sessionData,
                        cancellationToken
                    )
                    .then((result) => {
                        // 任务执行完成后的处理逻辑
                        if (!result.success) {
                            // 如果任务失败，记录日志但工作流不立即中止
                            // 而是标记相关的SKU为失败状态
                            const errorMsg = `任务 [${handler.description || taskInfo.name}] 失败: ${result.message}`;
                            updateFn({ message: errorMsg, type: 'error' });
                            skusForSource.forEach(sku => sku.status = 'failed');
                            return; // Promise.all 中的这个分支结束
                        }

                        // 任务成功，更新SKU生命周期
                        updateFn({
                            message: `[${handler.description || taskInfo.name}] 成功处理了一批SKU。`,
                            type: 'success'
                        });

                        // 将返回的数据合并回对应的SKU
                        if (result.data && Array.isArray(result.data)) {
                            result.data.forEach(updatedSkuData => {
                                // 确保 updatedSkuData 和 sku 存在
                                if (updatedSkuData && updatedSkuData.sku) {
                                    const lifecycle = skuLifecycles[updatedSkuData.sku];
                                    if (lifecycle) {
                                        Object.assign(lifecycle.data, updatedSkuData);
                                        lifecycle.completedTasks.add(taskInfo.name);
                                    }
                                }
                            });
                        }
                    })
                    .catch((error) => {
                        const errorMsg = `执行任务 [${handler.description || taskInfo.name}] 时发生严重错误: ${error.message}`;
                        updateFn({ message: errorMsg, type: 'error' });
                        // 发生严重错误，标记所有相关SKU为失败
                        skusForSource.forEach(sku => sku.status = 'failed');
                    });

                stagePromises.push(taskPromise);
            }
        }

        // 等待当前阶段所有并行任务完成
        await Promise.all(stagePromises);

        // 检查是否有任何SKU在本阶段失败
        const failedSkus = allSkus.filter(s => s.status === 'failed');
        if (failedSkus.length > 0) {
            const errorMsg = `在阶段 [${stage.name}] 中，有 ${failedSkus.length} 个SKU处理失败。工作流终止。`;
            updateFn({ message: errorMsg, type: 'error' });
            return { success: false, message: errorMsg, data: skuLifecycles };
        }
    }

    const finalFailedSkus = allSkus.filter(s => s.status === 'failed').length;
    if (finalFailedSkus > 0) {
        return {
            success: false,
            message: `工作流完成，但有 ${finalFailedSkus} 个SKU处理失败。`,
            data: skuLifecycles
        };
    }

    updateFn({ message: `🎉 所有SKU均已成功完成工作流！`, type: 'success', stage: true });
    return {
        success: true,
        message: '工作流已成功完成。',
        data: skuLifecycles
    };
} 