<template>
  <div class="file-upload-container">
    <el-button type="primary" size="small" @click="triggerFileInput">选择文件</el-button>
    <div v-if="selectedFile" class="selected-file-info">
      <span class="file-name">{{ selectedFile.name }}</span>
      <el-button type="danger" size="small" link @click="clearFile">清除</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { ElButton } from 'element-plus'

const props = defineProps({
  modelValue: [Object, String], // Can be a File object or a path string
  accept: {
    type: String,
    default: '*' // 默认接受所有文件类型
  }
})

const emit = defineEmits(['update:modelValue'])

const selectedFile = ref(props.modelValue)

watch(
  () => props.modelValue,
  (newValue) => {
    selectedFile.value = newValue
  }
)

const fileFilters = computed(() => {
  if (props.accept === '*' || !props.accept) {
    return [{ name: 'All Files', extensions: ['*'] }]
  }
  const extensions = props.accept.split(',').map((ext) => ext.trim().replace('.', ''))
  return [{ name: 'Custom Files', extensions }]
})

const triggerFileInput = async () => {
  try {
    const filePath = await window.api.showOpenDialog({
      properties: ['openFile'],
      filters: fileFilters.value
    })

    if (filePath) {
      const fileName = filePath.split(/[/\\]/).pop()
      const fileObject = {
        name: fileName,
        path: filePath
      }
      selectedFile.value = fileObject
      emit('update:modelValue', fileObject)
    }
  } catch (error) {
    console.error('选择文件时出错:', error)
  }
}

const clearFile = () => {
  selectedFile.value = null
  emit('update:modelValue', null)
}
</script>

<style scoped>
.file-upload-container {
  display: flex;
  align-items: center;
  gap: 6px;
}
.selected-file-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #606266;
  max-width: 150px;
  overflow: hidden;
}
.file-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
