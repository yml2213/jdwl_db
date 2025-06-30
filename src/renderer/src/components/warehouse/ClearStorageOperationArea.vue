<template>
  <div class="operation-area">
    <div class="form-group">
      <label class="form-label">快捷选择</label>
      <div class="radio-group">
        <label class="radio-label">
          <input
            type="radio"
            :checked="props.form.mode === 'sku'"
            @change="$emit('update:form', { ...props.form, mode: 'sku' })"
          />
          输入SKU
        </label>
        <label class="radio-label">
          <input
            type="radio"
            :checked="props.form.mode === 'whole_store'"
            @change="$emit('update:form', { ...props.form, mode: 'whole_store' })"
          />
          整店SKU
        </label>
      </div>
    </div>

    <div v-if="props.form.mode === 'sku'">
      <div class="form-group">
        <label class="form-label">输入SKU</label>
        <textarea
          :value="props.form.sku"
          @input="$emit('update:form', { ...props.form, sku: $event.target.value })"
          placeholder="请输入SKU (多个SKU请每行一个)"
          class="form-input"
        ></textarea>
      </div>
      <div class="form-group">
        <FileUploader @file-change="handleFileChange" />
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">功能选项 <span class="required-tip">(必选至少一项)</span></label>
      <div class="checkbox-group">
        <label class="checkbox-label">
          <input
            type="checkbox"
            :checked="props.form.options.clearStockAllocation"
            @change="
              $emit('update:form', {
                ...props.form,
                options: { ...props.form.options, clearStockAllocation: $event.target.checked }
              })
            "
          />
          库存分配清零
        </label>
        <label class="checkbox-label">
          <input
            type="checkbox"
            :checked="props.form.options.cancelJpSearch"
            @change="
              $emit('update:form', {
                ...props.form,
                options: { ...props.form.options, cancelJpSearch: $event.target.checked }
              })
            "
          />
          取消京配打标
        </label>
      </div>
    </div>

    <div class="form-group">
      <StoreSelector
        :model-value="props.selectedStore"
        :shops="props.shopsList"
        :loading="props.isLoadingShops"
        :error="props.shopLoadError"
        @update:modelValue="$emit('update:selectedStore', $event)"
      />
    </div>

    <div class="form-group">
      <button class="btn btn-primary" @click="$emit('addTask')">添加任务</button>
    </div>
  </div>
</template>

<script setup>
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

const handleFileChange = (file) => {
  if (file && file.name.endsWith('.txt')) {
    const reader = new FileReader()
    reader.onload = (e) => {
      emit('update:form', { ...props.form, sku: e.target.result })
    }
    reader.readAsText(file)
  }
}
</script>

<style scoped>
.operation-area {
  flex: 0 0 380px;
  background: #f7f8fa;
  padding: 20px 20px 60px 20px;
  overflow-y: auto;
  border-right: 1px solid #e8e8e8;
  color: #333;
  display: flex;
  flex-direction: column;
}
.form-group {
  margin-bottom: 1.5rem;
}
.form-label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: bold;
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
.required-tip {
  color: #dc3545;
  font-size: 0.8rem;
  font-weight: normal;
}
</style>
