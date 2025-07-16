const workflows = {
    manual: {
        name: '手动选择',
        options: {
            importStoreProducts: false,
            enableStoreProducts: false,
            importLogisticsAttributes: false,
            enableInventoryAllocation: false,
            addInventory: false,
            enableJpSearch: false,
            importProductNames: false,
            // Non-task options
            skipConfigErrors: true,
            inventoryAmount: 1000
        }
    },
    warehouseLabeling: {
        name: '入仓打标',
        stages: [
            {
                name: '阶段一：商品导入与验证',
                sequential: true,
                tasks: [
                    { name: 'importStoreProducts', source: 'initial' },
                    {
                        type: 'waitForCompletion',
                        name: 'productDataReady',
                        sourceTask: 'importStoreProducts',
                        pollingTask: 'getProductData',
                        description: '等待商品数据同步完成',
                        maxRetries: 50, // 50次尝试
                        retryDelay: 10000 // 10秒延迟
                    }
                ]
            },
            {
                name: '阶段二：商品处理与激活 (并行)',
                tasks: [
                    { name: 'enableStoreProducts', source: 'importStoreProducts' },
                    { name: 'importLogisticsAttributes', source: 'productDataReady' },
                    { name: 'enableInventoryAllocation', source: 'productDataReady' }
                ]
            },
            {
                name: '阶段三：依赖性收尾 (并行)',
                tasks: [
                    // 这个任务依赖 'importLogisticsAttributes'
                    { name: 'addInventory', source: 'importLogisticsAttributes' },
                    // 这个任务依赖 'enableInventoryAllocation'
                    { name: 'enableJpSearch', source: 'enableInventoryAllocation' }
                ]
            }
        ],
        // UI options for display and manual mode
        options: {
            importStoreProducts: true,
            enableStoreProducts: true,
            importLogisticsAttributes: true,
            enableInventoryAllocation: true,
            addInventory: true,
            enableJpSearch: true,
            importProductNames: false,
            inventoryAmount: 1000
        }
    }
}

/**
 * @description Provides a deep copy of the workflow definitions.
 * @returns {object} The workflows object.
 */
export function getWorkflows() {
    return JSON.parse(JSON.stringify(workflows))
}

/**
 * @description Gets the initial state for the operation form.
 * @returns {object} The initial form state.
 */
export function getInitialFormState() {
    return {
        quickSelect: 'manual', // 'manual' or a workflow key
        skus: '',
        options: { ...workflows.manual.options },
        payloads: {
            importProductNames: null
        }
    }
}

/**
 * @description Retrieves a list of all valid keys for manual tasks.
 * These are the options that represent an executable task.
 * @returns {string[]} An array of manual task keys.
 */
export function getAllManualTaskKeys() {
    const manualOptions = workflows.manual.options
    const nonTaskKeys = ['skipConfigErrors', 'inventoryAmount'] // Options that don't represent a task
    return Object.keys(manualOptions).filter((key) => !nonTaskKeys.includes(key))
}

/**
 * @description Defines the data dependencies between tasks.
 * The key is the task that has a dependency, and the value is the task that provides the data.
 * @returns {object} A map of task dependencies.
 */
export const taskDependencies = {
    importLogisticsAttributes: 'getProductData',
    enableInventoryAllocation: 'getProductData',
    addInventory: 'getProductData',
    enableJpSearch: 'getProductData',
    cancelJpSearch: 'getProductData',
    clearStockAllocation: 'getProductData',
    returnToVendor: 'getProductData',
} 