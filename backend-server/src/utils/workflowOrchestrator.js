/**
 * 通用工作流编排器
 * 负责按顺序执行任务列表，并在任务之间传递和管理一个共享的上下文。
 */

/**
 * 执行一个由多个任务组成的工作流。
 *
 * @param {object} options - 执行选项。
 * @param {object[]} options.workflow - 要执行的任务对象数组。每个对象应包含 'name' 和 'context'。
 * @param {object} options.taskHandlers - 一个从任务名称映射到任务模块的字典。
 * @param {object} options.initialContext - 初始的共享上下文数据。
 * @param {Function} options.updateFn - 用于向前端发送状态更新的回调函数。
 * @param {object} options.sessionData - 当前用户的会话数据。
 * @param {object} options.cancellationToken - 用于检查任务是否被取消的令牌。
 * @returns {Promise<object>} 返回一个包含最终执行结果的对象 { success, message, data }。
 */
export async function executeWorkflow({
    workflow,
    taskHandlers,
    initialContext,
    updateFn,
    sessionData,
    cancellationToken
}) {
    // 初始化一个共享的上下文，它会随着工作流的执行而不断丰富
    let sharedContext = { ...initialContext };
    let finalResult = { success: true, message: '工作流已成功完成。' };

    for (const taskInfo of workflow) {
        if (!cancellationToken.value) {
            updateFn({ message: '工作流在执行中被取消。', type: 'warn' });
            return { success: false, message: '工作流已取消。' };
        }

        const handler = taskHandlers[taskInfo.name];
        if (!handler || typeof handler.execute !== 'function') {
            const errorMsg = `未找到任务处理器: ${taskInfo.name}`;
            updateFn({ message: errorMsg, error: true });
            throw new Error(errorMsg);
        }

        // 准备当前任务的执行上下文
        // 合并 共享上下文 和 任务自带的上下文
        const currentTaskContext = {
            ...sharedContext,
            ...taskInfo.context,
            updateFn: updateFn
        };

        try {
            updateFn({ message: `--- 开始执行任务: ${handler.description || taskInfo.name} ---`, type: 'info' });

            const result = await handler.execute(
                currentTaskContext,
                sessionData,
                cancellationToken
            );

            if (!result.success) {
                // 如果任何一个任务失败，则立即终止整个工作流
                const errorMsg = `任务 [${handler.description || taskInfo.name}] 失败: ${result.message}`;
                updateFn({ message: errorMsg, error: true });
                return { success: false, message: errorMsg };
            }

            // 如果任务成功，并且返回了数据，则将其合并到共享上下文中
            if (result.data && typeof result.data === 'object') {
                sharedContext = { ...sharedContext, ...result.data };
            }

            updateFn({ message: `--- 任务: ${handler.description || taskInfo.name} 完成 ---`, type: 'success' });
            finalResult = result; // 将最后一次成功的结果作为工作流的最终结果

        } catch (error) {
            const errorMsg = `执行任务 [${handler.description || taskInfo.name}] 时发生严重错误: ${error.message}`;
            updateFn({ message: errorMsg, error: true });
            throw new Error(errorMsg); // 抛出异常以被上层捕获
        }
    }

    return finalResult;
} 