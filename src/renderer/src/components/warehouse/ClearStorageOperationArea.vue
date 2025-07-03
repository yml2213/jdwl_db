<template>
  <div class="operation-area">
    <div class="scrollable-content">
      <div class="form-group">
        <label class="form-label">模式选择</label>
        <div class="radio-group">
          <label class="radio-label">
            <input type="radio" v-model="mode" value="sku" />
            按SKU
          </label>
          <label class="radio-label">
            <input type="radio" v-model="mode" value="whole_store" />
            按整店
          </label>
        </div>
      </div>

      <div v-if="mode === 'sku'" class="form-group sku-input-container">
        <div class="sku-header">
          <label class="form-label">输入SKU</label>
          <FileUploader @file-change="handleFileChange" />
        </div>
        <div class="textarea-wrapper">
          <textarea
            v-model="sku"
            placeholder="请输入SKU (多个SKU请每行一个)"
            class="sku-textarea"
          ></textarea>
          <button v-if="sku" class="clear-sku-btn" @click="sku = ''">清空</button>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">功能选项 <span class="required-tip">(必选至少一项)</span></label>
        <div class="checkbox-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="clearStockAllocation" />
            库存分配清零
          </label>
          <label class="checkbox-label">
            <input type="checkbox" v-model="cancelJpSearch" />
            取消京配打标
          </label>
        </div>
      </div>

      <div class="form-group">
        <StoreSelector
          v-model="storeVModel"
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
import { computed } from 'vue'
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

// 使用 computed 来处理与父组件的双向绑定，避免直接修改 props
const mode = computed({
  get: () => props.form.mode,
  set: (value) => emit('update:form', { ...props.form, mode: value })
})

const sku = computed({
  get: () => props.form.sku,
  set: (value) => emit('update:form', { ...props.form, sku: value })
})

const clearStockAllocation = computed({
  get: () => props.form.options.clearStockAllocation,
  set: (value) => {
    emit('update:form', {
      ...props.form,
      options: { ...props.form.options, clearStockAllocation: value }
    })
  }
})

const cancelJpSearch = computed({
  get: () => props.form.options.cancelJpSearch,
  set: (value) => {
    emit('update:form', {
      ...props.form,
      options: { ...props.form.options, cancelJpSearch: value }
    })
  }
})

// 为StoreSelector创建v-model
const storeVModel = computed({
  get: () => props.selectedStore,
  set: (value) => emit('update:selectedStore', value)
})

const handleFileChange = (file) => {
  if (file && file.name.endsWith('.txt')) {
    const reader = new FileReader()
    reader.onload = (e) => {
      sku.value = e.target.result
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

.radio-group,
.checkbox-group {
  display: flex;
  gap: 1.5rem;
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
