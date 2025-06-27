<template>
  <div class="operation-area">
    <div class="form-group">
      <label class="form-label">快捷选择</label>
      <div class="select-wrapper">
        <select v-model="props.form.quickSelect" class="form-select">
          <option value="">请选择快捷方式</option>
          <option value="warehouseLabelingFlow">任务流 -- 入仓打标</option>
        </select>
      </div>
    </div>

    <sku-input v-model="props.form.sku" />

    <feature-options v-model="props.form.options" />

    <store-selector
      :shops="props.shopsList"
      :loading="props.isLoadingShops"
      :error="props.shopLoadError"
      v-model="props.form.selectedStore"
    />

    <warehouse-selector
      :warehouses="props.warehousesList"
      :loading="props.isLoadingWarehouses"
      :error="props.warehouseLoadError"
      v-model="props.form.selectedWarehouse"
    />

    <div class="form-actions">
      <button class="btn btn-default">保存快捷</button>
      <button class="btn btn-success" @click="emit('addTask')">添加任务</button>
    </div>
  </div>
</template>

<script setup>
import SkuInput from './SkuInput.vue'
import FeatureOptions from './feature/FeatureOptions.vue'
import StoreSelector from './StoreSelector.vue'
import WarehouseSelector from './WarehouseSelector.vue'

const props = defineProps({
  form: Object,
  shopsList: Array,
  isLoadingShops: Boolean,
  shopLoadError: String,
  warehousesList: Array,
  isLoadingWarehouses: Boolean,
  warehouseLoadError: String
})

const emit = defineEmits(['addTask'])
</script>

<style scoped>
.operation-area {
  flex: 0 0 380px;
  background: #f7f8fa;
  padding: 20px;
  overflow-y: auto;
  border-right: 1px solid #e8e8e8;
}

.form-actions {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 30px;
}

.btn {
  height: 36px;
  padding: 0 16px;
  font-size: 14px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
}

.btn-default {
  background-color: #f5f7fa;
  border: 1px solid #dcdfe6;
  color: #606266;
}

.btn-success {
  background-color: #52c41a;
  border-color: #52c41a;
  color: white;
}

.btn:hover {
  opacity: 0.9;
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
