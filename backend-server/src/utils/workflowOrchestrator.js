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
    // 检查是否为 SKU-centric 工作流
    if (initialContext.skus && Array.isArray(initialContext.skus)) {
        // --- SKU-CENTRIC WORKFLOW (EXISTING LOGIC) ---
        const skuLifecycles = initializeSkuLifecycles(initialContext.skus);
        const allSkus = Object.values(skuLifecycles);

        for (let i = 0; i < stages.length; i++) {
            if (!cancellationToken.value) {
                updateFn({ message: '工作流被用户取消。', type: 'warn' });
                return { success: false, message: '工作流已取消。' };
            }

            const stage = stages[i];
            updateFn({
                message: `--- [阶段 ${i + 1}/${stages.length}]：${stage.name} ---`,
                type: 'info',
                stage: true
            });

            const tasksBySource = stage.tasks.reduce((acc, task) => {
                const source = task.source || 'initial';
                if (!acc[source]) acc[source] = [];
                acc[source].push(task);
                return acc;
            }, {});

            const stagePromises = [];

            for (const source in tasksBySource) {
                const skusForSource =
                    source === 'initial'
                        ? allSkus
                        : allSkus.filter((sku) => sku.completedTasks.has(source));

                if (initialContext.scope !== 'whole_store' && skusForSource.length === 0) {
                    updateFn({
                        message: `阶段 ${i + 1}, 数据源 '${source}': 没有需要处理的SKU，跳过。`,
                        type: 'info',
                        debug: true
                    });
                    continue;
                }

                const tasksToRun = tasksBySource[source];

                for (const taskInfo of tasksToRun) {
                    const handler = taskHandlers[taskInfo.name];
                    if (!handler || typeof handler.execute !== 'function') {
                        const errorMsg = `未找到任务处理器: ${taskInfo.name}`;
                        updateFn({ message: errorMsg, type: 'error' });
                        return { success: false, message: errorMsg };
                    }

                    updateFn({
                        message: `[${handler.description || taskInfo.name
                            }] 准备处理 ${skusForSource.length} 个SKU...`,
                        type: 'info'
                    });

                    const taskPromise = handler
                        .execute(
                            {
                                ...initialContext,
                                ...taskInfo.context,
                                skus: skusForSource,
                                updateFn
                            },
                            sessionData,
                            cancellationToken
                        )
                        .then((result) => {
                            if (!result.success) {
                                const errorMsg = `任务 [${handler.description || taskInfo.name
                                    }] 失败: ${result.message}`;
                                updateFn({ message: errorMsg, type: 'error' });
                                skusForSource.forEach((sku) => (sku.status = 'failed'));
                                return;
                            }

                            updateFn({
                                message: `[${handler.description || taskInfo.name
                                    }] 成功处理了一批SKU。`,
                                type: 'success'
                            });

                            if (result.data && Array.isArray(result.data)) {
                                result.data.forEach((updatedSkuData) => {
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
                            const errorMsg = `执行任务 [${handler.description || taskInfo.name
                                }] 时发生严重错误: ${error.message}`;
                            updateFn({ message: errorMsg, type: 'error' });
                            skusForSource.forEach((sku) => (sku.status = 'failed'));
                        });

                    stagePromises.push(taskPromise);
                }
            }

            await Promise.all(stagePromises);

            const failedSkus = allSkus.filter((s) => s.status === 'failed');
            if (failedSkus.length > 0) {
                const errorMsg = `在阶段 [${stage.name}] 中，有 ${failedSkus.length} 个SKU处理失败。工作流终止。`;
                updateFn({ message: errorMsg, type: 'error' });
                return { success: false, message: errorMsg, data: skuLifecycles };
            }
        }
    } else {
        // --- TASK-CENTRIC (NON-SKU) WORKFLOW ---
        updateFn({ message: '开始执行通用工作流...', type: 'info' });

        for (let i = 0; i < stages.length; i++) {
            if (!cancellationToken.value) {
                updateFn({ message: '工作流被用户取消。', type: 'warn' });
                return { success: false, message: '工作流已取消。' };
            }

            const stage = stages[i];
            updateFn({
                message: `--- [阶段 ${i + 1}/${stages.length}]：${stage.name} ---`,
                type: 'info',
                stage: true
            });

            for (const taskInfo of stage.tasks) {
                const handler = taskHandlers[taskInfo.name];
                if (!handler || typeof handler.execute !== 'function') {
                    const errorMsg = `未找到任务处理器: ${taskInfo.name}`;
                    updateFn({ message: errorMsg, type: 'error' });
                    return { success: false, message: errorMsg };
                }

                updateFn({ message: `[${handler.description || taskInfo.name}] 任务开始...`, type: 'info' });

                try {
                    const result = await handler.execute(
                        { ...initialContext, ...taskInfo.context, updateFn },
                        sessionData,
                        cancellationToken
                    );

                    if (!result || !result.success) {
                        const errorMsg = `任务 [${handler.description || taskInfo.name}] 失败: ${result ? result.message : '未知错误'
                            }`;
                        // 发送 end 事件，以便前端可以正确更新任务最终状态和结果
                        updateFn({
                            event: 'end',
                            success: false,
                            message: result?.message || '任务执行失败'
                        });
                        return { success: false, message: errorMsg };
                    }

                    updateFn({
                        message: `任务 [${handler.description || taskInfo.name}] 成功。`,
                        type: 'success'
                    });
                } catch (error) {
                    const errorMsg = `执行任务 [${handler.description || taskInfo.name
                        }] 时发生严重错误: ${error.message}`;
                    // 同样发送 end 事件
                    updateFn({
                        event: 'end',
                        success: false,
                        message: error.message || '任务发生严重错误'
                    });
                    return { success: false, message: errorMsg };
                }
            }
        }
    }

    const finalFailedSkus = (initialContext.skus &&
        Object.values(initializeSkuLifecycles(initialContext.skus)).filter((s) => s.status === 'failed')
            .length) || 0;
    if (finalFailedSkus > 0) {
        return {
            success: false,
            message: `工作流完成，但有 ${finalFailedSkus} 个SKU处理失败。`,
            data: initializeSkuLifecycles(initialContext.skus)
        };
    }

    updateFn({ message: `🎉 工作流已成功完成！`, type: 'success', stage: true });
    return {
        success: true,
        message: '工作流已成功完成。',
        data:
            (initialContext.skus && initializeSkuLifecycles(initialContext.skus)) ||
            {}
    };
} 