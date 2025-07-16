<template>
  <div class="operation-area">
    <div class="scrollable-content">
      <div class="form-group">
        <label class="form-label">模式选择</label>
        <div class="radio-group">
          <label class="radio-label">
            <input
              type="radio"
              :checked="form.mode === 'sku'"
              value="sku"
              @change="updateMode('sku')"
            />
            按SKU
          </label>
          <label class="radio-label">
            <input
              type="radio"
              :checked="form.mode === 'whole_store'"
              value="whole_store"
              @change="updateMode('whole_store')"
            />
            按整店
          </label>
        </div>
      </div>

      <div v-if="form.mode === 'sku'" class="form-group sku-input-container">
        <div class="sku-header">
          <label class="form-label">输入SKU</label>
          <FileUploader @file-change="handleFileChange" />
        </div>
        <div class="textarea-wrapper">
          <textarea
            :value="form.sku"
            @input="updateSku"
            placeholder="请输入SKU (多个SKU请每行一个)"
            class="sku-textarea"
          ></textarea>
          <button v-if="form.sku" class="clear-sku-btn" @click="clearSku">清空</button>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">功能选项 <span class="required-tip">(必选至少一项)</span></label>
        <div class="checkbox-group">
          <label class="checkbox-label">
            <input
              type="checkbox"
              :checked="form.options.clearStockAllocation"
              @change="updateOption('clearStockAllocation', $event.target.checked)"
            />
            库存分配清零
          </label>
          <label class="checkbox-label">
            <input
              type="checkbox"
              :checked="form.options.cancelJpSearch"
              @change="updateOption('cancelJpSearch', $event.target.checked)"
            />
            取消京配打标
          </label>
          <label class="checkbox-label">
            <input
              type="checkbox"
              :checked="form.options.disableStoreProducts"
              @change="updateOption('disableStoreProducts', $event.target.checked)"
            />
            停用店铺商品
          </label>
          <label class="checkbox-label">
            <input
              type="checkbox"
              :checked="form.options.disableProductMasterData"
              @change="updateOption('disableProductMasterData', $event.target.checked)"
            />
            停用商品主数据
          </label>
          <label class="checkbox-label">
            <input
              type="checkbox"
              :checked="form.options.returnToVendor"
              @change="updateOption('returnToVendor', $event.target.checked)"
            />
            退供应商库存
          </label>
        </div>
      </div>

      <div class="form-group">
        <StoreSelector
          :model-value="selectedStore"
          @update:model-value="$emit('update:selectedStore', $event)"
          :shops="props.shopsList"
          :loading="props.isLoadingShops"
          :error="props.shopLoadError"
        />
      </div>
    </div>

    <div class="form-actions">
      <button class="action-btn add-task-btn" @click="$emit('addTask')">添加任务</button>
    </div>
  </div>
</template>

<script setup>
import StoreSelector from './StoreSelector.vue'
import FileUploader from './FileUploader.vue'

const props = defineProps({
  form: Object,
  shopsList: Array,
  isLoadingShops: Boolean,
  shopLoadError: String,
  selectedStore: String
})

const emit = defineEmits(['update:form', 'update:selectedStore', 'addTask'])

const updateMode = (newMode) => {
  emit('update:form', { ...props.form, mode: newMode })
}

const updateSku = (event) => {
  emit('update:form', { ...props.form, sku: event.target.value })
}

const clearSku = () => {
  emit('update:form', { ...props.form, sku: '' })
}

const updateOption = (optionName, value) => {
  emit('update:form', {
    ...props.form,
    options: { ...props.form.options, [optionName]: value }
  })
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
  display: flex;
  flex-direction: column;
}

.scrollable-content {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 20px;
}

.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  font-weight: 600;
  margin-bottom: 10px;
  color: #333;
  font-size: 14px;
}

.radio-group {
  display: flex;
  gap: 1.5rem;
}

.checkbox-group {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.radio-label,
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 400;
  cursor: pointer;
  color: #333;
}

.sku-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
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

.sku-textarea:focus {
  outline: none;
  border-color: #409eff;
  background-color: #fff;
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
.clear-sku-btn:hover {
  color: #dc3545;
}

.form-actions {
  margin-top: auto;
  padding: 20px;
  border-top: 1px solid #e8e8e8;
  background-color: #ffffff;
}

.action-btn {
  width: 100%;
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

.required-tip {
  font-size: 12px;
  color: #909399;
  font-weight: 400;
  margin-left: 5px;
}
</style>
