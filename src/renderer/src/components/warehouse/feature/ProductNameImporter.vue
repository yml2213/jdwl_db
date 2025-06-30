<template>
  <div class="importer-container">
    <div class="importer-header">
      <h4>导入商品简称</h4>
      <p class="subtitle">通过Excel文件批量导入商品简称信息。</p>
    </div>

    <div v-if="modelValue" class="feature-options-container">
      <FileUploader
        v-model="selectedFile"
        label="选择包含商品简称的Excel文件 (SKU在第一列, 名称在第二列)"
        accept=".xls,.xlsx"
        :required="true"
      />
    </div>

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
      <div class="log-content">
        <p v-for="(log, index) in logs" :key="index" :class="['log-line', `log-${log.type}`]">
          {{ log.text }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import FileUploader from '../FileUploader.vue'
import importProductNamesFeature from '../../../features/warehouseLabeling/importProductNames.js'
import { ElNotification } from 'element-plus'

const props = defineProps({
  modelValue: Boolean, // 控制显示/隐藏
  payload: Object // v-model:payload
})

const emit = defineEmits(['update:payload'])

const selectedFile = ref(null)
const isProcessing = ref(false)
const logs = ref([])

// 当组件被隐藏时，清空文件
watch(
  () => props.modelValue,
  (newValue) => {
    if (!newValue) {
      selectedFile.value = null
    }
  }
)

// 当文件变化时，更新payload
watch(selectedFile, (newFile) => {
  emit('update:payload', newFile ? { file: newFile } : null)
})

const addLog = (message, type = 'info') => {
  logs.value.push({
    text: `[${new Date().toLocaleTimeString()}] ${message}`,
    type
  })
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
  addLog('开始执行导入商品简称功能...', 'info')

  try {
    const result = await importProductNamesFeature.execute(selectedFile.value)
    addLog(`导入完成: ${result.message}`, result.success ? 'success' : 'error')

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

    if (result.data) {
      addLog('-----服务器返回详细信息-----', 'info')
      // 后端返回的原始结果可能在 response.data.data 中
      const serverResult = result.data || result
      if (serverResult?.resultMsg) {
        addLog(serverResult.resultMsg, result.success ? 'info' : 'error')
      } else if (result.data.message) {
        addLog(result.data.message, result.success ? 'info' : 'error')
      } else if (!result.success) {
        // 如果没有具体的 resultMsg，也显示一个通用消息
        addLog(result.message || '未知服务端错误', 'error')
      }
      addLog('--------------------------', 'info')
    }
  } catch (error) {
    const errorMessage = `出现未预料的错误: ${error.message}`
    addLog(errorMessage, 'error')
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
}

.log-line {
  font-family: 'Courier New', Courier, monospace;
  font-size: 12px;
  line-height: 1.5;
  margin: 0;
  padding: 1px 0;
}

.log-info {
  color: #909399;
}

.log-success {
  color: #67c23a;
}

.log-error {
  color: #f56c6c;
}

.feature-options-container {
  padding: 10px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  margin-top: 10px;
  background-color: #f8f9fa;
}
</style>
