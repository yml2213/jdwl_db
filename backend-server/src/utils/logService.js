import { EventEmitter } from 'events';

class LogService extends EventEmitter { }

const logService = new LogService();

// 增加最大监听器数量，以防多个并发任务导致警告
logService.setMaxListeners(50);

export default logService; 