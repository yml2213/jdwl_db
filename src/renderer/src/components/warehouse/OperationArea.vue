<template>
  <div class="operation-area">
    <div class="form-group">
      <label class="form-label">快捷选择</label>
      <div class="select-wrapper">
        <select :value="quickSelect" @change="$emit('update:quickSelect', $event.target.value)" class="form-select">
          <option value="manual">手动选择</option>
          <option value="warehouseLabeling">任务流 -- 入仓打标</option>
        </select>
      </div>
    </div>

    <sku-input :model-value="sku" @update:model-value="$emit('update:sku', $event)" />

    <!-- Pass slot for manual options -->
    <slot></slot>

    <store-selector
      :shops="shopsList"
      :loading="isLoadingShops"
      :error="shopLoadError"
      :model-value="selectedStore"
      @update:model-value="$emit('update:selectedStore', $event)"
    />

    <warehouse-selector
      :warehouses="warehousesList"
      :loading="isLoadingWarehouses"
      :error="warehouseLoadError"
      :model-value="selectedWarehouse"
      @update:model-value="$emit('update:selectedWarehouse', $event)"
    />

    <div class="form-actions">
      <button class="btn btn-primary" @click.prevent="">添加至快捷</button>
      <button class="btn btn-success" @click="emit('addTask')">添加任务</button>
    </div>
  </div>
</template>

<script setup>
import SkuInput from './SkuInput.vue'
import StoreSelector from './StoreSelector.vue'
import WarehouseSelector from './WarehouseSelector.vue'

defineProps({
  sku: String,
  quickSelect: String,
  selectedStore: String,
  selectedWarehouse: String,
  isManualMode: Boolean,
  shopsList: Array,
  isLoadingShops: Boolean,
  shopLoadError: String,
  warehousesList: Array,
  isLoadingWarehouses: Boolean,
  warehouseLoadError: String
})

const emit = defineEmits([
  'addTask',
  'update:sku',
  'update:quickSelect',
  'update:selectedStore',
  'update:selectedWarehouse'
])
</script>

<style scoped>
.operation-area {
  flex: 0 0 380px;
  background: #f7f8fa;
  padding: 20px 20px 60px 20px;
  overflow-y: auto;
  border-right: 1px solid #e8e8e8;
  color: #333;
}

.form-actions {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 30px;
}

.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  font-weight: 500;
  margin-bottom: 8px;
  color: #333;
}

.select-wrapper {
  position: relative;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  overflow: hidden;
  background-color: white;
}

.form-select {
  width: 100%;
  padding: 8px 10px;
  border: none;
  outline: none;
  height: 36px;
  cursor: pointer;
  background-color: transparent;
}

.form-select:focus {
  border-color: #2196f3;
}
</style>
