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
        options: {
            importStoreProducts: true,
            enableStoreProducts: true,
            importLogisticsAttributes: true,
            enableInventoryAllocation: true,
            addInventory: true,
            enableJpSearch: true,
            importProductNames: false,
            // Non-task options
            skipConfigErrors: true,
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