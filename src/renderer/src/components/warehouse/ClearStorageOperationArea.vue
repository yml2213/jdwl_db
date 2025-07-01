<template>
  <div class="operation-area">
    <div class="form-group">
      <label class="form-label">快捷选择</label>
      <div class="segmented-control">
        <label class="segmented-control-option" :class="{ 'is-active': mode === 'sku' }">
          <input type="radio" v-model="mode" value="sku" class="segmented-control-input" />
          输入SKU
        </label>
        <label class="segmented-control-option" :class="{ 'is-active': mode === 'whole_store' }">
          <input type="radio" v-model="mode" value="whole_store" class="segmented-control-input" />
          整店
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
        <el-button v-if="sku" class="clear-sku-btn" type="danger" link @click="sku = ''"
          >清空</el-button
        >
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

    <div class="form-actions">
      <button class="btn btn-primary" @click="$emit('addTask')">添加任务</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { ElButton } from 'element-plus'
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
  background: #f7f8fa;
  padding: 20px;
  border-right: 1px solid #e8e8e8;
  color: #333;
  display: flex;
  flex-direction: column;
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

/* Updated styles for a modern segmented control */
.segmented-control {
  display: flex;
  background-color: #f0f2f5; /* Light grey background for the container */
  border-radius: 6px; /* More rounded corners */
  padding: 4px;
  width: 100%;
  gap: 4px; /* Add space between options */
}

.segmented-control-option {
  flex: 1;
  padding: 8px 12px;
  text-align: center;
  cursor: pointer;
  color: #606266; /* Muted text color for inactive options */
  transition: all 0.2s ease-in-out;
  position: relative;
  font-size: 14px;
  border-radius: 4px; /* Rounded corners for the option itself */
  background-color: transparent;
  border: none;
}

.segmented-control-option:not(:last-child) {
  border-right: none;
}

.segmented-control-option.is-active {
  background-color: #409eff; /* White background for the active "pill" */
  color: #ffffff; /* Darker text for active */
  font-weight: 500;
  box-shadow: none; /* Subtle shadow to lift it up */
}

.segmented-control-input {
  /* Hide the actual radio button */
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.radio-group,
.checkbox-group {
  display: flex;
  gap: 1rem;
}

.radio-label,
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 400;
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
  padding: 8px 40px 8px 10px; /* 右侧留出清空按钮空间 */
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  resize: vertical;
  line-height: 1.5;
  font-size: 14px;
}

.clear-sku-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 0;
}

.form-actions {
  margin-top: auto; /* Push to the bottom */
}

.btn-primary {
  width: 100%;
  padding: 10px 15px;
  background-color: #409eff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;
}

.btn-primary:hover {
  background-color: #66b1ff;
}

.required-tip {
  color: #f56c6c;
  font-size: 12px;
  font-weight: normal;
  margin-left: 4px;
}
</style>
