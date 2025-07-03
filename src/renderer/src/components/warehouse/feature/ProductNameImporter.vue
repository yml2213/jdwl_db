<template>
  <div class="importer-container">
    <div class="importer-header">
      <h4>导入商品简称</h4>
      <p class="subtitle">通过Excel文件批量导入商品简称信息。</p>
    </div>

    <div class="feature-options-container">
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
    <button @click="$emit('cancel')" class="cancel-button">取消</button>

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
import { ElNotification, ElMessageBox } from 'element-plus'

const props = defineProps({
  modelValue: Boolean, // 控制显示/隐藏
  payload: Object // v-model:payload
})

const emit = defineEmits(['update:payload', 'cancel'])

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

    if (result.success && result.data) {
      // Backend endpoint call was successful, and we have task data
      const taskResult = result.data
      addLog(`导入完成: ${taskResult.message}`, taskResult.success ? 'success' : 'error')

      if (taskResult.success) {
        ElNotification({
          title: '成功',
          message: '商品简称导入任务已成功完成。',
          type: 'success'
        })
      } else {
        ElMessageBox.alert(taskResult.message, '导入失败', {
          type: 'error',
          center: true,
          showClose: false,
          customClass: 'no-close-message-box',
          callback: () => {}
        })
        setTimeout(() => {
          ElMessageBox.close()
        }, 3000)
      }
    } else {
      // Handle cases where the /task endpoint itself failed
      const errorMessage = result.message || '与后端通信失败。'
      addLog(`导入失败: ${errorMessage}`, 'error')
      ElMessageBox.alert(errorMessage, '导入失败', {
        type: 'error',
        center: true,
        showClose: false,
        customClass: 'no-close-message-box',
        callback: () => {}
      })
      setTimeout(() => {
        ElMessageBox.close()
      }, 3000)
    }
  } catch (error) {
    const errorMessage = `出现未预料的错误: ${error.message}`
    addLog(errorMessage, 'error')
    ElMessageBox.alert(errorMessage, '执行出错', {
      type: 'error',
      center: true,
      showClose: false,
      customClass: 'no-close-message-box',
      callback: () => {}
    })
    setTimeout(() => {
      ElMessageBox.close()
    }, 3000)
  } finally {
    isProcessing.value = false
  }
}

const clearLogs = () => {
  logs.value = []
}
</script>

<style>
/* 定义一个全局样式来隐藏特定MessageBox的关闭按钮 */
.no-close-message-box .el-message-box__headerbtn {
  display: none !important;
}
</style>

<style scoped>
.importer-container {
  border: none;
  border-radius: 8px;
  padding: 0px;
  margin-top: 0px;
  background-color: #fff;
  box-shadow: none;
}

.importer-header h4 {
  margin: 0 0 5px 0;
  font-size: 16px;
  color: #303133;
  justify-content: center;
  gap: 8px;
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
  margin-top: 10px;
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
  color: #606266;
  margin-bottom: 5px;
}

.log-line.log-info {
  color: #909399;
}

.log-line.log-success {
  color: #67c23a;
}

.log-line.log-error {
  color: #f56c6c;
}

.cancel-button {
  background-color: #f56c6c;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.3s;
  width: 100%;
  margin-top: 10px;
}

.cancel-button:hover {
  background-color: #f78989;
}
</style>
