// 同步管理器
class SyncManager {
    constructor() {
        this.syncIntervals = new Map();
        this.syncCallbacks = new Map();
        this.lastSyncTimes = new Map();
        this.syncQueue = new Map();
        this.isSyncing = false;
    }

    // 开始同步对话
    startChatSync(chatId, callback, interval = SYSTEM_CONFIG.SYSTEM.autoRefreshInterval) {
        this.stopChatSync(chatId);

        const syncInterval = setInterval(async () => {
            await this.syncChat(chatId, callback);
        }, interval);

        this.syncIntervals.set(chatId, syncInterval);
        this.syncCallbacks.set(chatId, callback);

        // 立即执行一次同步
        this.syncChat(chatId, callback);
    }

    // 停止同步对话
    stopChatSync(chatId) {
        const interval = this.syncIntervals.get(chatId);
        if (interval) {
            clearInterval(interval);
            this.syncIntervals.delete(chatId);
            this.syncCallbacks.delete(chatId);
        }
    }

    // 同步单个对话
    async syncChat(chatId, callback) {
        if (!SystemUtils.checkOnlineStatus()) {
            console.log('网络不可用，跳过同步');
            return;
        }

        const queueKey = `chat_${chatId}`;
        if (this.syncQueue.has(queueKey)) {
            console.log('同步任务已在队列中，跳过');
            return;
        }

        this.syncQueue.set(queueKey, true);

        try {
            const lastSync = this.lastSyncTimes.get(chatId) || 0;
            const messages = await getChatMessages(chatId);
            
            // 检查是否有新消息
            const newMessages = messages.filter(msg => 
                new Date(msg.created_at).getTime() > lastSync
            );

            if (newMessages.length > 0 || messages.length === 0) {
                if (callback && typeof callback === 'function') {
                    callback(messages, newMessages);
                }
                
                // 更新最后同步时间
                this.lastSyncTimes.set(chatId, Date.now());
            }

        } catch (error) {
            console.error(`同步对话 ${chatId} 错误:`, error);
            
            if (callback && typeof callback === 'function') {
                callback([], [], error);
            }
        } finally {
            this.syncQueue.delete(queueKey);
        }
    }

    // 批量同步所有对话
    async syncAllChats(callback) {
        if (this.isSyncing) {
            console.log('同步正在进行中，跳过');
            return;
        }

        this.isSyncing = true;

        try {
            const chats = await getAllChats();
            const results = {
                total: chats.length,
                successful: 0,
                failed: 0,
                errors: []
            };

            for (const chat of chats) {
                try {
                    await this.syncChat(chat.id, (messages, newMessages) => {
                        if (callback) {
                            callback(chat.id, messages, newMessages);
                        }
                    });
                    results.successful++;
                } catch (error) {
                    results.failed++;
                    results.errors.push({
                        chatId: chat.id,
                        error: error.message
                    });
                    console.error(`同步对话 ${chat.id} 失败:`, error);
                }
            }

            console.log(`批量同步完成: ${results.successful} 成功, ${results.failed} 失败`);
            return results;

        } finally {
            this.isSyncing = false;
        }
    }

    // 强制立即同步
    async forceSync(chatId) {
        const callback = this.syncCallbacks.get(chatId);
        if (callback) {
            await this.syncChat(chatId, callback);
        }
    }

    // 获取同步状态
    getSyncStatus(chatId) {
        return {
            isSyncing: this.syncQueue.has(`chat_${chatId}`),
            lastSync: this.lastSyncTimes.get(chatId),
            hasCallback: this.syncCallbacks.has(chatId)
        };
    }

    // 停止所有同步
    stopAllSync() {
        for (const interval of this.syncIntervals.values()) {
            clearInterval(interval);
        }

        this.syncIntervals.clear();
        this.syncCallbacks.clear();
        this.syncQueue.clear();
        this.lastSyncTimes.clear();
        
        console.log('所有同步已停止');
    }

    // 重置同步状态
    resetSync() {
        this.stopAllSync();
        console.log('同步状态已重置');
    }
}

// 创建全局同步管理器实例
const syncManager = new SyncManager();

// 网络状态恢复时重新开始同步
window.addEventListener('online', () => {
    console.log('网络恢复，重新开始同步');
    // 这里可以重新启动重要的同步任务
});

// 页面卸载时清理
window.addEventListener('beforeunload', () => {
    syncManager.stopAllSync();
});

// 导出到全局
window.SyncManager = SyncManager;
window.syncManager = syncManager;
