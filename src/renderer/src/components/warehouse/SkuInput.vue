<template>
  <div class="form-group">
    <label class="form-label">输入SKU</label>
    <div class="input-group">
      <textarea
        :value="modelValue"
        @input="updateValue"
        placeholder="请输入SKU（多个SKU请每行一个）"
        class="form-input sku-textarea"
        rows="5"
      ></textarea>
    </div>
    <file-uploader @file-change="handleFileChange" @clear-file="handleClearFile" />
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue'
import FileUploader from './FileUploader.vue'

defineProps({
  modelValue: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:modelValue', 'file-change', 'clear-file'])

const updateValue = (event) => {
  emit('update:modelValue', event.target.value)
}

const handleFileChange = (file) => {
  emit('file-change', file)
}

const handleClearFile = () => {
  emit('clear-file')
}
</script>

<style scoped>
.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
}

.input-group {
  display: flex;
  gap: 10px;
}

.form-input {
  flex: 1;
  height: 36px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 0 12px;
}

.sku-textarea {
  resize: vertical;
  min-height: 120px;
  padding: 12px;
  font-family: monospace;
  width: 100%;
}
</style>
