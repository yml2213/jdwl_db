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
                name: '阶段一：商品准备 (并行)',
                tasks: [
                    // 这三个任务可以并行执行，它们都只依赖最初的SKU列表
                    { name: 'importStoreProducts', source: 'initial' },
                    { name: 'getProductData', source: 'initial' }, // 这个任务负责获取详细的商品数据
                    { name: 'enableStoreProducts', source: 'initial' }
                ]
            },
            {
                name: '阶段二：核心流程 (并行管道)',
                tasks: [
                    // 这两个任务都依赖 'getProductData' 的输出，可以并行启动
                    { name: 'importLogisticsAttributes', source: 'getProductData' },
                    { name: 'enableInventoryAllocation', source: 'getProductData' }
                ]
            },
            {
                name: '阶段三：依赖性收尾 (串行)',
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