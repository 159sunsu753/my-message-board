// 工具函数库
class SystemUtils {
    // 加密解密函数
    static encrypt(text) {
        try {
            return btoa(unescape(encodeURIComponent(text)));
        } catch (error) {
            console.error('加密错误:', error);
            return text;
        }
    }

    static decrypt(encrypted) {
        try {
            return decodeURIComponent(escape(atob(encrypted)));
        } catch (error) {
            console.error('解密错误:', error);
            return encrypted;
        }
    }

    // 时间格式化
    static formatTime(timestamp, includeSeconds = false) {
        const date = new Date(timestamp);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        
        if (isToday) {
            return date.toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
                ...(includeSeconds && { second: '2-digit' })
            });
        } else {
            return date.toLocaleString('zh-CN', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    }

    static formatDate(timestamp) {
        return new Date(timestamp).toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    // 文本处理
    static truncateText(text, maxLength = 100) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    static countWords(text) {
        if (!text) return 0;
        return text.trim().split(/\s+/).length;
    }

    // 验证函数
    static isValidSecretKey(key) {
        if (!key || key.length < 3) return false;
        if (key.length > 100) return false;
        // 允许中文、英文、数字、常见符号
        return /^[\u4e00-\u9fa5a-zA-Z0-9\s\-_@#$%&*()+=\[\]{}|;:,.<>?！￥…（）—【】、；：‘“，。《》？]+$/.test(key);
    }

    static isValidUsername(username) {
        if (!username || username.length < 2) return false;
        if (username.length > 50) return false;
        return /^[a-zA-Z0-9\u4e00-\u9fa5_-]+$/.test(username);
    }

    static isValidPassword(password) {
        return password && password.length >= SYSTEM_CONFIG.SECURITY.minPasswordLength;
    }

    // 本地存储管理
    static setSessionData(key, data) {
        try {
            sessionStorage.setItem(key, JSON.stringify({
                data: data,
                timestamp: Date.now()
            }));
        } catch (error) {
            console.error('保存会话数据错误:', error);
        }
    }

    static getSessionData(key, maxAge = SYSTEM_CONFIG.SYSTEM.sessionTimeout) {
        try {
            const item = sessionStorage.getItem(key);
            if (!item) return null;

            const parsed = JSON.parse(item);
            const age = Date.now() - parsed.timestamp;

            if (age > maxAge) {
                sessionStorage.removeItem(key);
                return null;
            }

            return parsed.data;
        } catch (error) {
            console.error('读取会话数据错误:', error);
            return null;
        }
    }

    static clearSessionData() {
        try {
            const keysToKeep = []; // 可以定义需要保留的key
            const allKeys = Object.keys(sessionStorage);
            
            allKeys.forEach(key => {
                if (!keysToKeep.includes(key)) {
                    sessionStorage.removeItem(key);
                }
            });
        } catch (error) {
            console.error('清理会话数据错误:', error);
        }
    }

    // 网络状态检测
    static checkOnlineStatus() {
        SYSTEM_STATE.online = navigator.onLine;
        return SYSTEM_STATE.online;
    }

    static async checkGitHubAPI() {
        try {
            const response = await fetch(`${SYSTEM_CONFIG.GITHUB.apiBase}/rate_limit`);
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    // 错误处理
    static handleError(error, userMessage = '操作失败') {
        console.error('系统错误:', error);

        let message = userMessage;
        let type = 'error';

        if (error.message.includes('404')) {
            message = '资源未找到，请检查系统配置';
        } else if (error.message.includes('401')) {
            message = '认证失败，请重新登录';
            type = 'warning';
        } else if (error.message.includes('403')) {
            message = '权限不足或API限制';
        } else if (error.message.includes('429')) {
            message = '请求过于频繁，请稍后重试';
        } else if (!navigator.onLine) {
            message = '网络连接失败，请检查网络设置';
        }

        showAlert(message, type);
        return { success: false, message, originalError: error };
    }

    // 防抖函数
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // 生成唯一ID
    static generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // 文件大小格式化
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 消息内容清理
    static sanitizeMessage(content) {
        if (!content) return '';
        
        // 移除潜在的恶意脚本
        return content
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/on\w+="[^"]*"/g, '')
            .replace(/on\w+='[^']*'/g, '')
            .replace(/javascript:/gi, '')
            .replace(/vbscript:/gi, '');
    }
}

// 网络请求封装
class ApiClient {
    constructor() {
        this.baseURL = SYSTEM_CONFIG.GITHUB.apiBase;
        this.requests = new Map();
    }

    async request(endpoint, options = {}) {
        const requestId = SystemUtils.generateId();
        const url = `${this.baseURL}${endpoint}`;

        const defaultOptions = {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
            },
            timeout: 30000
        };

        const config = { ...defaultOptions, ...options };

        try {
            // 检查网络状态
            if (!SystemUtils.checkOnlineStatus()) {
                throw new Error('网络连接不可用');
            }

            // 添加请求到跟踪列表
            this.requests.set(requestId, { url, config });

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), config.timeout);
            
            config.signal = controller.signal;

            const response = await fetch(url, config);
            clearTimeout(timeoutId);

            // 从跟踪列表移除
            this.requests.delete(requestId);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
            }

            return await response.json();

        } catch (error) {
            this.requests.delete(requestId);
            
            if (error.name === 'AbortError') {
                throw new Error('请求超时');
            }
            
            throw error;
        }
    }

    async get(endpoint, token = null) {
        const headers = {};
        if (token) {
            headers['Authorization'] = `token ${token}`;
        }

        return this.request(endpoint, { method: 'GET', headers });
    }

    async post(endpoint, data, token = null) {
        const headers = {};
        if (token) {
            headers['Authorization'] = `token ${token}`;
        }

        return this.request(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(data)
        });
    }

    async patch(endpoint, data, token = null) {
        const headers = {};
        if (token) {
            headers['Authorization'] = `token ${token}`;
        }

        return this.request(endpoint, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(data)
        });
    }

    // 取消所有进行中的请求
    cancelAllRequests() {
        this.requests.forEach((request, id) => {
            // 在实际实现中，这里应该使用AbortController
            console.log(`取消请求: ${id}`, request.url);
        });
        this.requests.clear();
    }
}

// 创建全局API客户端实例
const apiClient = new ApiClient();

// 导出到全局
window.SystemUtils = SystemUtils;
window.ApiClient = ApiClient;
window.apiClient = apiClient;
