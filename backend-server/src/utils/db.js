import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', '..', 'db.json');

console.log('[DB Util] 数据库文件路径已计算为:', dbPath); // 增加日志用于调试

// 一个非常简单的文件锁，防止并发写入
let isLocked = false;
const lock = () => {
    if (isLocked) {
        return new Promise(resolve => setTimeout(() => resolve(lock()), 100));
    }
    isLocked = true;
    return Promise.resolve();
};
const unlock = () => {
    isLocked = false;
};

/**
 * 安全地读取和解析JSON文件
 * @returns {Promise<object>}
 */
const readDb = async () => {
    try {
        await fs.access(dbPath);
        const data = await fs.readFile(dbPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // 文件不存在，返回一个初始的数据库结构
            console.log('数据库文件不存在，将创建新的文件。');
            return { schemes: {} };
        }
        // 对于其他错误（如JSON解析失败），抛出异常
        console.error('读取或解析数据库文件失败:', error);
        throw error;
    }
};

/**
 * 安全地写入JSON文件
 * @param {object} data
 */
const writeDb = async (data) => {
    await lock();
    try {
        await fs.writeFile(dbPath, JSON.stringify(data, null, 2), 'utf8');
    } finally {
        unlock();
    }
};

/**
 * 获取指定key的方案ID
 * @param {string} key
 * @returns {Promise<number|null>}
 */
const getScheme = async (key) => {
    const db = await readDb();
    return db.schemes?.[key] || null;
};

/**
 * 保存指定key的方案ID
 * @param {string} key
 * @param {number} schemeId
 */
const saveScheme = async (key, schemeId) => {
    const db = await readDb();
    if (!db.schemes) {
        db.schemes = {};
    }
    db.schemes[key] = schemeId;
    await writeDb(db);
};

export default {
    getScheme,
    saveScheme
}; 