<template>
  <div class="operation-area">
    <div class="scrollable-content">
      <div class="form-group">
        <label class="form-label">快捷选择</label>
        <div class="select-wrapper">
          <select
            :value="form.quickSelect"
            @change="emit('update:form', { ...form, quickSelect: $event.target.value })"
            class="form-select"
          >
            <option value="manual">手动选择</option>
            <option value="warehouseLabeling">任务流 -- 入仓打标</option>
          </select>
        </div>
      </div>

      <div class="form-group sku-input-container">
        <div class="sku-header">
          <label class="form-label">输入SKU</label>
          <FileUploader @file-change="handleFileChange" />
        </div>
        <div class="textarea-wrapper">
          <textarea
            :value="form.sku"
            @input="emit('update:form', { ...form, sku: $event.target.value })"
            placeholder="请输入SKU (多个SKU请每行一个)"
            class="sku-textarea"
          ></textarea>
          <el-button
            v-if="form.sku"
            class="clear-sku-btn"
            type="danger"
            link
            @click="emit('update:form', { ...form, sku: '' })"
            >清空</el-button
          >
        </div>
      </div>

      <!-- Manual Options Section -->
      <div v-if="form.quickSelect === 'manual'" class="manual-options-container">
        <div class="manual-options-grid">
          <div v-for="option in manualOptions" :key="option.key" class="option-item">
            <input
              type="checkbox"
              :id="option.key"
              :checked="form.options[option.key]"
              @change="updateOption(option.key, $event.target.checked)"
            />
            <label :for="option.key">{{ option.label }}</label>
          </div>
        </div>

        <!-- Sub-options -->
        <div
          v-if="form.options.importLogisticsAttributes"
          class="sub-options-container logistics-options"
        >
          <div v-for="logisticsKey in Object.keys(logisticsOptions)" :key="logisticsKey" class="logistics-input-group">
            <label>{{ logisticsKey }}:</label>
            <input type="text" :value="logisticsOptions[logisticsKey]" @input="updateLogistics(logisticsKey, $event.target.value)" />
          </div>
        </div>

        <div v-if="form.options.addInventory" class="sub-options-container inventory-container">
          <label class="inventory-label">库存数量：</label>
          <input
            type="number"
            :value="form.options.inventoryAmount"
            @input="updateOption('inventoryAmount', $event.target.value)"
            class="inventory-input"
          />
        </div>
      </div>

      <div class="form-group">
        <StoreSelector
          :model-value="selectedStore"
          @update:modelValue="emit('update:selectedStore', $event)"
          :shops="shopsList"
          :loading="isLoadingShops"
          :error="shopLoadError"
        />
      </div>

      <div class="form-group">
        <WarehouseSelector
          :model-value="selectedWarehouse"
          @update:modelValue="emit('update:selectedWarehouse', $event)"
          :warehouses="warehousesList"
          :loading="isLoadingWarehouses"
          :error="warehouseLoadError"
        />
      </div>
    </div>

    <div class="form-actions">
      <button class="action-btn add-task-btn" @click="emit('addTask')">添加任务</button>
    </div>

    <el-dialog
      :model-value="form.options.importProductNames"
      @update:modelValue="updateOption('importProductNames', $event)"
      title="导入商品简称"
      width="600px"
      :modal="false"
      draggable
    >
      <ProductNameImporter
        v-if="form.options.importProductNames"
        v-model:payload="form.payloads.importProductNames"
        @cancel="updateOption('importProductNames', false)"
      />
    </el-dialog>
  </div>
</template>

<script setup>
import { ElButton, ElDialog } from 'element-plus'
import StoreSelector from './StoreSelector.vue'
import WarehouseSelector from './WarehouseSelector.vue'
import FileUploader from './FileUploader.vue'
import ProductNameImporter from './feature/ProductNameImporter.vue'

const props = defineProps({
  form: Object,
  selectedStore: String,
  selectedWarehouse: String,
  shopsList: Array,
  warehousesList: Array,
  isLoadingShops: Boolean,
  shopLoadError: String,
  isLoadingWarehouses: Boolean,
  warehouseLoadError: String,
  logisticsOptions: Object
})

const emit = defineEmits([
  'update:form',
  'update:logisticsOptions',
  'addTask',
  'update:selectedStore',
  'update:selectedWarehouse'
])

// Define manual options for rendering
const manualOptions = [
  { key: 'importStoreProducts', label: '导入店铺商品' },
  { key: 'enableStoreProducts', label: '启用店铺商品' },
  { key: 'importLogisticsAttributes', label: '导入物流属性(参数)' },
  { key: 'enableInventoryAllocation', label: '启用库存商品分配' },
  { key: 'enableJpSearch', label: '启用京配打标生效' },
  { key: 'addInventory', label: '添加库存' },
  { key: 'importProductNames', label: '导入商品简称' }
]

const updateOption = (key, value) => {
  emit('update:form', {
    ...props.form,
    options: { ...props.form.options, [key]: value }
  })
}

const updateLogistics = (key, value) => {
  emit('update:logisticsOptions', { ...props.logisticsOptions, [key]: value })
}

const handleFileChange = (file) => {
  if (file && file.name.endsWith('.txt')) {
    const reader = new FileReader()
    reader.onload = (e) => {
      emit('update:form', { ...props.form, sku: e.target.result })
    }
    reader.readAsText(file)
  }
}
</script>

<style scoped>
.operation-area {
  flex: 0 0 380px;
  background: #ffffff;
  border-right: 1px solid #e8e8e8;
  color: #333;
  display: flex;
  flex-direction: column;
}

.scrollable-content {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 20px;
}

.form-group {
  margin-bottom: 15px;
}

.form-label {
  display: block;
  font-weight: 500;
  margin-bottom: 8px;
  color: #333;
  font-size: 14px;
}

.select-wrapper {
  position: relative;
}

.form-select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  outline: none;
  height: 36px;
  cursor: pointer;
  background-color: white;
}

.textarea-wrapper {
  position: relative;
}

.sku-textarea {
  width: 100%;
  min-height: 120px;
  padding: 10px 45px 10px 10px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  resize: vertical;
  line-height: 1.6;
  font-size: 14px;
  background-color: #f9fafb;
}

.clear-sku-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 8px;
  background: transparent;
  border: none;
  color: #909399;
  cursor: pointer;
  font-size: 12px;
}

.manual-options-container {
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  padding: 15px;
  background-color: #ffffff;
  margin-top: 10px;
}

.manual-options-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.option-item {
  display: flex;
  align-items: center;
}

.option-item input[type='checkbox'] {
  margin-right: 8px;
}

.sub-options-container {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px dashed #dcdfe6;
}

.logistics-options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.logistics-input-group {
  display: flex;
  align-items: center;
  gap: 5px;
}
.logistics-input-group label {
  flex-shrink: 0;
}
.logistics-input-group input {
  width: 100%;
  padding: 4px 6px;
}

.inventory-container {
  display: flex;
  align-items: center;
  gap: 10px;
}

.inventory-label {
  font-weight: 500;
}

.inventory-input {
  width: 100px;
  padding: 6px 8px;
}

.form-actions {
  display: flex;
  gap: 10px;
  margin-top: auto;
  padding: 20px;
  border-top: 1px solid #e8e8e8;
  background-color: #ffffff;
}

.action-btn {
  flex: 1;
  padding: 10px 15px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 15px;
  font-weight: 500;
  transition: background-color 0.2s;
}

.add-task-btn {
  background-color: #2563eb;
  color: white;
}
.add-task-btn:hover {
  background-color: #1d4ed8;
}
</style>
