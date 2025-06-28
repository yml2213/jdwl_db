<template>
  <div class="file-upload-container">
    <div class="file-upload">
      <input
        type="file"
        ref="fileInputRef"
        @change="handleFileChange"
        accept=".xls,.xlsx"
        style="display: none"
      />
      <span class="btn btn-primary" @click="triggerFileInput">选择文件</span>
      <span v-if="selectedFile" class="selected-file-name">
        已选：{{ selectedFile.name }}
        <button class="btn-link" @click="handleClearFile">清除</button>
      </span>
      <span v-else class="selected-file-name">未选择文件</span>
    </div>
    <div class="batch-import"></div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const emit = defineEmits(['file-selected', 'clear-file'])

const fileInputRef = ref(null)
const selectedFile = ref(null)

const triggerFileInput = () => {
  fileInputRef.value.click()
}

const handleFileChange = (event) => {
  const files = event.target.files
  if (files && files.length > 0) {
    selectedFile.value = files[0]
    emit('file-selected', files[0])
  }
}

const handleClearFile = () => {
  selectedFile.value = null
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
  emit('clear-file')
}
</script>

<style scoped>
.file-upload-container {
  margin: 10px 0;
  position: relative;
}

.file-upload {
  display: flex;
  align-items: center;
  gap: 10px;
}

.selected-file-name {
  font-size: 12px;
  color: #909399;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.import-actions {
  display: flex;
  gap: 10px;
  margin-top: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.import-tip {
  color: #909399;
  margin-top: 5px;
  flex-basis: 100%;
  font-size: 12px;
}

.btn-link {
  background: none;
  border: none;
  color: #1890ff;
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
}

.btn-link:hover {
  color: #40a9ff;
}

.btn-primary {
  background-color: #2196f3;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
}
</style>
