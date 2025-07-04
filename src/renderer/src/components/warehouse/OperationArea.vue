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
            <option value="workflow">任务流 -- 入仓打标</option>
          </select>
        </div>
      </div>

      <div class="form-group sku-input-container">
        <div class="sku-header">
          <label class="form-label">输入SKU</label>
          <div class="file-upload-wrapper">
            <FileUploader @file-change="handleFileChange" />
          </div>
        </div>
        <div class="textarea-wrapper">
          <textarea
            :value="form.skus"
            @input="emit('update:form', { ...form, skus: $event.target.value })"
            placeholder="请输入SKU (多个SKU请每行一个)"
            class="sku-textarea"
          ></textarea>
          <el-button
            v-if="form.skus"
            class="clear-sku-btn"
            type="danger"
            link
            @click="emit('update:form', { ...form, skus: '' })"
            >清空</el-button
          >
        </div>
      </div>

      <!-- Manual Options Section -->
      <div class="manual-options-container">
        <div v-if="form.quickSelect === 'workflow'" class="workflow-info">
          <div class="workflow-info-title">已选择工作流模式：入仓打标</div>
          <div class="workflow-info-subtitle">包含以下任务：</div>
          <div class="workflow-tasks-list">
            <div
              v-for="option in manualOptions"
              :key="option.key"
              class="workflow-task-item"
              :class="{ enabled: form.options[option.key] }"
            >
              <i
                class="workflow-task-icon"
                :class="form.options[option.key] ? 'enabled' : 'disabled'"
              >
                {{ form.options[option.key] ? '✓' : '×' }}
              </i>
              <span>{{ option.label }}</span>
            </div>
          </div>
          <div class="workflow-info-note">注意：工作流模式下，任务选项由系统配置，无需手动勾选</div>
        </div>
        <div v-else class="manual-options-grid">
          <div v-for="option in manualOptions" :key="option.key" class="option-item">
            <input
              type="checkbox"
              :id="option.key"
              :checked="form.options[option.key]"
              :disabled="form.quickSelect !== 'manual'"
              @change="updateOption(option.key, $event.target.checked)"
            />
            <label :for="option.key" class="option-label">{{ option.label }}</label>
          </div>
        </div>

        <!-- Sub-options -->
        <div v-if="form.options.importLogisticsAttributes" class="sub-options-container">
          <div class="logistics-header">物流属性信息</div>
          <div class="logistics-options">
            <div class="logistics-input-group">
              <label>长度：</label>
              <input
                type="text"
                :value="logisticsOptions.length"
                @input="updateLogistics('length', $event.target.value)"
                placeholder="默认: 120.00"
                class="logistics-input"
                :disabled="form.quickSelect !== 'manual'"
              />
            </div>
            <div class="logistics-input-group">
              <label>宽度：</label>
              <input
                type="text"
                :value="logisticsOptions.width"
                @input="updateLogistics('width', $event.target.value)"
                placeholder="默认: 60.00"
                class="logistics-input"
                :disabled="form.quickSelect !== 'manual'"
              />
            </div>
            <div class="logistics-input-group">
              <label>高度：</label>
              <input
                type="text"
                :value="logisticsOptions.height"
                @input="updateLogistics('height', $event.target.value)"
                placeholder="默认: 6.00"
                class="logistics-input"
                :disabled="form.quickSelect !== 'manual'"
              />
            </div>
            <div class="logistics-input-group">
              <label>毛重：</label>
              <input
                type="text"
                :value="logisticsOptions.grossWeight"
                @input="updateLogistics('grossWeight', $event.target.value)"
                placeholder="默认: 0.1"
                class="logistics-input"
                :disabled="form.quickSelect !== 'manual'"
              />
            </div>
          </div>
          <div class="logistics-hint">
            <span>提示：长宽高单位为cm，毛重单位为kg</span>
          </div>
        </div>

        <div v-if="form.options.addInventory" class="sub-options-container">
          <div class="logistics-header">库存信息</div>
          <div class="logistics-options">
            <div class="logistics-input-group" style="grid-column: 1 / -1">
              <label>数量：</label>
              <input
                type="number"
                :value="form.options.inventoryAmount"
                @input="updateOption('inventoryAmount', $event.target.value)"
                placeholder="默认: 1000"
                class="logistics-input"
                :disabled="form.quickSelect !== 'manual'"
              />
            </div>
          </div>
          <div class="logistics-hint">
            <span>提示：添加库存会对所选SKU创建指定数量的库存</span>
          </div>
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
  { key: 'addInventory', label: '添加库存' },
  { key: 'enableJpSearch', label: '启用京配打标生效' },
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

const handleFileChange = (content) => {
  if (typeof content === 'string') {
    emit('update:form', { ...props.form, skus: content })
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

.sku-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.file-upload-wrapper {
  margin-left: auto;
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
  gap: 8px 12px;
}

.option-item {
  display: flex;
  align-items: center;
}

.option-item input[type='checkbox'] {
  margin-right: 6px;
}

.option-label {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sub-options-container {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px dashed #dcdfe6;
}

.logistics-header {
  font-size: 13px;
  font-weight: 500;
  color: #606266;
  margin-bottom: 10px;
  padding-bottom: 5px;
  border-bottom: 1px solid #f0f0f0;
}

.logistics-options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px 15px;
  position: relative;
  background-color: #fafafa;
  padding: 10px;
  border-radius: 4px;
}

.logistics-input-group {
  display: flex;
  align-items: center;
  gap: 5px;
}

.logistics-input-group label {
  flex-shrink: 0;
  width: 45px;
  text-align: right;
  font-size: 13px;
  color: #606266;
}

.logistics-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 13px;
  color: #606266;
  background-color: white;
}

.logistics-input::placeholder {
  color: #c0c4cc;
  font-size: 12px;
}

.logistics-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
  text-align: right;
  padding-right: 5px;
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

.workflow-info {
  padding: 10px;
  background-color: #f8f9fa;
  border-radius: 4px;
}

.workflow-info-title {
  font-weight: bold;
  margin-bottom: 8px;
  color: #409eff;
}

.workflow-info-subtitle {
  font-size: 13px;
  margin-bottom: 8px;
}

.workflow-tasks-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 10px;
}

.workflow-task-item {
  display: flex;
  align-items: center;
  font-size: 13px;
  padding: 4px;
}

.workflow-task-item.enabled {
  color: #67c23a;
}

.workflow-task-icon {
  margin-right: 6px;
  font-weight: bold;
  font-style: normal;
}

.workflow-task-icon.enabled {
  color: #67c23a;
}

.workflow-task-icon.disabled {
  color: #f56c6c;
}

.workflow-info-note {
  font-size: 12px;
  color: #909399;
  font-style: italic;
  border-top: 1px dashed #dcdfe6;
  padding-top: 8px;
  margin-top: 5px;
}
</style>
