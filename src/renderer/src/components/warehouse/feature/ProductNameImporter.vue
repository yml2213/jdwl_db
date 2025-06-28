<template>
  <div class="importer-container">
    <div class="importer-header">
      <h4>导入商品简称</h4>
      <p class="subtitle">通过Excel文件批量导入商品简称信息。</p>
    </div>

    <FileUploader @file-selected="handleFileSelect" :disabled="isProcessing" />

    <button @click="startImport" :disabled="!selectedFile || isProcessing" class="import-button">
      <span v-if="isProcessing">
        <i class="loading-icon"></i>
        处理中...
      </span>
      <span v-else>开始导入</span>
    </button>

    <div v-if="logs.length > 0" class="log-area">
      <div class="log-header">
        <h5>导入日志</h5>
        <button @click="clearLogs" class="clear-log-button">清空日志</button>
      </div>
      <pre class="log-content"><code v-html="formattedLogs"></code></pre>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import FileUploader from '../FileUploader.vue' // <--- 路径已修正
import importProductNamesFeature from '../../../features/warehouseLabeling/importProductNames'
import { ElNotification } from 'element-plus'

const selectedFile = ref(null)
const isProcessing = ref(false)
const logs = ref([])

const handleFileSelect = (file) => {
  selectedFile.value = file
  logs.value.push(`已选择文件: ${file.name}`)
}

const addLog = (message) => {
  logs.value.push(`[${new Date().toLocaleTimeString()}] ${message}`)
}

const startImport = async () => {
  if (!selectedFile.value) {
    ElNotification({
      title: '错误',
      message: '请先选择一个文件',
      type: 'error'
    })
    return
  }

  isProcessing.value = true
  addLog('开始执行导入商品简称功能...')

  try {
    const result = await importProductNamesFeature.execute(selectedFile.value)
    addLog(`导入完成: ${result.message}`)

    if (result.success) {
      ElNotification({
        title: '成功',
        message: result.message,
        type: 'success'
      })
    } else {
      ElNotification({
        title: '导入失败',
        message: result.message,
        type: 'error',
        duration: 0 // 不自动关闭
      })
    }

    if (result.data?.resultMsg) {
      addLog('-----服务器返回详细信息-----')
      addLog(result.data.resultMsg)
      addLog('--------------------------')
    }
  } catch (error) {
    const errorMessage = `出现未预料的错误: ${error.message}`
    addLog(errorMessage)
    ElNotification({
      title: '执行出错',
      message: errorMessage,
      type: 'error',
      duration: 0
    })
  } finally {
    isProcessing.value = false
  }
}

const clearLogs = () => {
  logs.value = []
}

const formattedLogs = computed(() => {
  return logs.value.join('\n')
})
</script>

<style scoped>
.importer-container {
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  padding: 20px;
  margin-top: 15px;
  background-color: #fafafa;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.importer-header h4 {
  margin: 0 0 5px 0;
  font-size: 16px;
  color: #303133;
}

.subtitle {
  font-size: 13px;
  color: #909399;
  margin-top: 0;
  margin-bottom: 15px;
}

.import-button {
  background-color: #409eff;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.3s;
  width: 100%;
  margin-top: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.import-button:disabled {
  background-color: #a0cfff;
  cursor: not-allowed;
}

.import-button:not(:disabled):hover {
  background-color: #66b1ff;
}

.loading-icon {
  border: 2px solid #fff;
  border-top-color: transparent;
  border-radius: 50%;
  width: 14px;
  height: 14px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.log-area {
  margin-top: 20px;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.log-header h5 {
  margin: 0;
  font-size: 14px;
  color: #303133;
}

.clear-log-button {
  background: none;
  border: 1px solid #dcdfe6;
  color: #606266;
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
}

.clear-log-button:hover {
  background-color: #f5f7fa;
  color: #409eff;
  border-color: #c6e2ff;
}

.log-content {
  background-color: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  padding: 15px;
  height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: 'Courier New', Courier, monospace;
  font-size: 12px;
  line-height: 1.5;
  color: #333;
}
</style>
