<template>
  <div class="operation-area">
    <div class="form-group">
      <label class="form-label">快捷选择</label>
      <div class="radio-group">
        <label class="radio-label">
          <input type="radio" v-model="form.mode" value="sku" />
          输入SKU
        </label>
        <label class="radio-label">
          <input type="radio" v-model="form.mode" value="whole_store" />
          整店SKU
        </label>
      </div>
    </div>

    <div v-if="form.mode === 'sku'">
      <div class="form-group">
        <label class="form-label">输入SKU</label>
        <textarea v-model="form.sku" placeholder="请输入SKU (多个SKU请每行一个)" class="form-input"></textarea>
      </div>
      <div class="form-group">
        <FileUploader @file-change="handleFileChange" />
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">功能选项</label>
      <div class="checkbox-group">
        <label class="checkbox-label">
          <input type="checkbox" v-model="form.options.clearStockAllocation" />
          库存分配清零
        </label>
        <label class="checkbox-label">
          <input type="checkbox" v-model="form.options.cancelJdDeliveryTag" />
          取消京配打标
        </label>
      </div>
    </div>

    <div class="form-group">
      <StoreSelector
        v-model="form.selectedStore"
        :shops="shopsList"
        :loading="isLoadingShops"
        :error="shopLoadError"
        @change="handleStoreChange"
      />
    </div>
    
    <div class="form-group">
      <button class="btn btn-primary" @click="handleAddTask">添加任务</button>
    </div>
  </div>
</template>

<script setup>
import { inject } from 'vue'
import StoreSelector from './StoreSelector.vue'
import FileUploader from './FileUploader.vue'

const form = inject('form')
const shopsList = inject('shopsList')
const isLoadingShops = inject('isLoadingShops')
const shopLoadError = inject('shopLoadError')
const handleAddTask = inject('handleAddTask')
const handleStoreChange = inject('handleStoreChange')
const handleFileChange = inject('handleFileChange')
</script>

<style scoped>
.operation-area {
  flex: 0 0 350px;
  padding: 20px;
  background-color: #f8f9fa;
  overflow-y: auto;
  border-right: 1px solid #dee2e6;
}
.form-group {
  margin-bottom: 1.5rem;
}
.form-label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: bold;
}
.radio-group, .checkbox-group {
  display: flex;
  gap: 1rem;
}
.radio-label, .checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.form-input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ced4da;
  border-radius: 0.25rem;
  min-height: 100px;
}
.btn-primary {
  width: 100%;
  padding: 0.75rem;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
}
.btn-primary:hover {
  background-color: #0056b3;
}
</style>
