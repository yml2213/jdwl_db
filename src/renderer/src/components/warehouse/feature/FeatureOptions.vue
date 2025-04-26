<template>
  <div class="form-group">
    <label class="form-label">功能选项</label>
    <div class="checkbox-group">
      <label class="checkbox-label">
        <input type="checkbox" v-model="options.importStore" />
        <span>导入店铺商品</span>
      </label>
      <label class="checkbox-label">
        <input type="checkbox" v-model="options.useStore" />
        <span>启用店铺商品</span>
      </label>
      <label class="checkbox-label">
        <input type="checkbox" v-model="options.importProps" @change="handleImportPropsChange" />
        <span>导入物流属性</span>
      </label>
      <label class="checkbox-label">
        <input type="checkbox" v-model="options.useMainData" />
        <span>启用商品主数据</span>
      </label>
      <label class="checkbox-label">
        <input type="checkbox" v-model="options.useWarehouse" />
        <span>启用库存商品分配</span>
      </label>
      <label class="checkbox-label">
        <input type="checkbox" v-model="options.useJdEffect" />
        <span>启用京配打标生效</span>
      </label>
      <label class="checkbox-label">
        <input type="checkbox" v-model="options.importTitle" />
        <span>导入商品简称</span>
      </label>
      <label class="checkbox-label">
        <input type="checkbox" v-model="options.useBatchManage" />
        <span>启用批次管理</span>
      </label>
    </div>
  </div>
</template>

<script setup>
import { computed, inject } from 'vue'

const openLogisticsImporter = inject('openLogisticsImporter')

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({
      importStore: true,
      useStore: true,
      importProps: false,
      useMainData: false,
      useWarehouse: false,
      useJdEffect: false,
      importTitle: false,
      useBatchManage: false
    })
  }
})

const emit = defineEmits(['update:modelValue'])

const options = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

// 处理导入物流属性选项变更
const handleImportPropsChange = (event) => {
  if (event.target.checked) {
    // 勾选"导入物流属性"时，弹出导入对话框
    openLogisticsImporter()
  }
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

.checkbox-group {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.checkbox-label input[type='checkbox'] {
  margin-right: 6px;
}
</style>
