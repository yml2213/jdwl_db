<template>
  <div class="logistics-importer">
    <div class="import-dialog">
      <h3>导入物流属性</h3>
      <div class="form-group">
        <label class="form-label">长度 (mm)</label>
        <input type="number" v-model="dimensions.length" class="form-input" min="1" />
      </div>
      <div class="form-group">
        <label class="form-label">宽度 (mm)</label>
        <input type="number" v-model="dimensions.width" class="form-input" min="1" />
      </div>
      <div class="form-group">
        <label class="form-label">高度 (mm)</label>
        <input type="number" v-model="dimensions.height" class="form-input" min="1" />
      </div>
      <div class="form-group">
        <label class="form-label">毛重 (kg)</label>
        <input
          type="number"
          v-model="dimensions.weight"
          class="form-input"
          min="0.01"
          step="0.01"
        />
      </div>
      <div class="import-actions">
        <button class="btn btn-primary" @click="generateLogisticsTemplate" :disabled="isGenerating">
          {{ isGenerating ? '生成模板中...' : '生成物流模板' }}
        </button>
        <button
          class="btn btn-success"
          @click="submitTemplate"
          :disabled="!canSubmit || isUploading"
        >
          {{ isUploading ? '提交中...' : '提交物流数据' }}
        </button>
      </div>
      <div v-if="generatedTemplate" class="template-preview">
        <h4>生成的模板预览</h4>
        <div class="template-table">
          <table>
            <thead>
              <tr>
                <th v-for="(header, index) in templateHeaders" :key="index">{{ header }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, rowIndex) in previewRows" :key="rowIndex">
                <td v-for="(cell, cellIndex) in row" :key="cellIndex">{{ cell }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="template-info">共 {{ totalSkus }} 个SKU，最多显示10条记录</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, defineProps, defineEmits, computed } from 'vue'
import { getSelectedDepartment } from '../../utils/storageHelper'

const props = defineProps({
  skuList: {
    type: Array,
    required: true
  },
  waitTime: {
    type: Number,
    default: 5
  }
})

const emit = defineEmits(['close', 'submit'])

// 物流尺寸数据
const dimensions = ref({
  length: 120,
  width: 60,
  height: 60,
  weight: 0.1
})

// 状态标志
const isGenerating = ref(false)
const isUploading = ref(false)
const generatedTemplate = ref(null)

// 模板表头
const templateHeaders = [
  '事业部商品编码',
  '事业部编码',
  '商家商品编号',
  '长(mm)',
  '宽(mm)',
  '高(mm)',
  '净重(kg)',
  '毛重(kg)'
]

// 计算属性：总SKU数量
const totalSkus = computed(() => props.skuList.length)

// 计算属性：预览行数据（最多显示10行）
const previewRows = computed(() => {
  if (!generatedTemplate.value) return []
  return generatedTemplate.value.slice(1, 11) // 跳过表头，最多显示10行
})

// 计算属性：是否可以提交
const canSubmit = computed(() => {
  return (
    generatedTemplate.value &&
    props.skuList.length > 0 &&
    dimensions.value.length > 0 &&
    dimensions.value.width > 0 &&
    dimensions.value.height > 0 &&
    dimensions.value.weight > 0
  )
})

// 生成物流模板数据
const generateLogisticsTemplate = () => {
  isGenerating.value = true

  try {
    // 获取事业部信息
    const department = getSelectedDepartment()
    if (!department) {
      alert('未选择事业部，无法生成模板')
      isGenerating.value = false
      return
    }

    // 表头行
    const headers = [...templateHeaders]

    // 数据行
    const rows = props.skuList.map((sku) => {
      return [
        '', // 事业部商品编码（空白）
        department.deptNo, // 事业部编码
        sku, // 商家商品编号（SKU）
        dimensions.value.length, // 长(mm)
        dimensions.value.width, // 宽(mm)
        dimensions.value.height, // 高(mm)
        '', // 净重(kg) - 默认空白
        dimensions.value.weight // 毛重(kg)
      ]
    })

    // 合并表头和数据行
    generatedTemplate.value = [headers, ...rows]
  } catch (error) {
    console.error('生成模板失败:', error)
    alert(`生成模板失败: ${error.message || '未知错误'}`)
  } finally {
    isGenerating.value = false
  }
}

// 提交模板数据
const submitTemplate = () => {
  if (!generatedTemplate.value) {
    alert('请先生成模板')
    return
  }

  if (
    confirm(
      `确定要提交${props.skuList.length}个SKU的物流属性数据吗？每批处理将等待${props.waitTime}分钟。`
    )
  ) {
    isUploading.value = true

    // 触发提交事件
    emit('submit', {
      skuList: props.skuList,
      template: generatedTemplate.value,
      dimensions: dimensions.value,
      waitTime: props.waitTime
    })
  }
}
</script>

<style scoped>
.logistics-importer {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.import-dialog {
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 24px;
  width: 600px;
  max-width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.import-dialog h3 {
  margin: 0 0 20px;
  font-size: 18px;
  color: #333;
}

.form-group {
  margin-bottom: 16px;
}

.form-label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
}

.form-input {
  width: 100%;
  height: 36px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 0 12px;
}

.import-actions {
  display: flex;
  justify-content: space-between;
  margin: 24px 0;
}

.btn {
  height: 36px;
  padding: 0 16px;
  font-size: 14px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background-color: #2196f3;
  color: white;
}

.btn-success {
  background-color: #52c41a;
  color: white;
}

.template-preview {
  margin-top: 20px;
  border-top: 1px solid #eee;
  padding-top: 20px;
}

.template-preview h4 {
  margin: 0 0 16px;
  font-size: 16px;
  color: #333;
}

.template-table {
  overflow-x: auto;
  margin-bottom: 12px;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  border: 1px solid #eee;
  padding: 8px 12px;
  text-align: left;
  font-size: 13px;
}

th {
  background-color: #f5f7fa;
  color: #606266;
  font-weight: 500;
}

.template-info {
  font-size: 13px;
  color: #909399;
  text-align: right;
}
</style>
