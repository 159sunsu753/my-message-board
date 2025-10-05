class SyncManager {
    constructor() {
        this.syncIntervals = new Map();
        this.syncCallbacks = new Map();
        this.lastSyncTimes = new Map();
        this.syncQueue = new Map();
        this.isSyncing = false;
    }

    startChatSync(chatId, callback, interval = 5000) {
        this.stopChatSync(chatId);

        const syncInterval = setInterval(async () => {
            await this.syncChat(chatId, callback);
        }, interval);

        this.syncIntervals.set(chatId, syncInterval);
        this.syncCallbacks.set(chatId, callback);

        this.syncChat(chatId, callback);
    }

    stopChatSync(chatId) {
        const interval = this.syncIntervals.get(chatId);
        if (interval) {
            clearInterval(interval);
            this.syncIntervals.delete(chatId);
            this.syncCallbacks.delete(chatId);
        }
    }

    async syncChat(chatId, callback) {
        if (!navigator.onLine) {
            console.log('网络不可用，跳过同步');
            return;
        }

        const queueKey = `chat_${chatId}`;
        if (this.syncQueue.has(queueKey)) {
            return;
        }

        this.syncQueue.set(queueKey, true);

        try {
            const lastSync = this.lastSyncTimes.get(chatId) || 0;
            const messages = await getChatMessages(chatId);
            
            const newMessages = messages.filter(msg => 
                new Date(msg.created_at).getTime() > lastSync
            );

            if (newMessages.length > 0 || messages.length === 0) {
                if (callback && typeof callback === 'function') {
                    callback(messages, newMessages);
                }
                
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

    async syncAllChats(callback) {
        if (this.isSyncing) {
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
                }
            }

            return results;

        } finally {
            this.isSyncing = false;
        }
    }

    async forceSync(chatId) {
        const callback = this.syncCallbacks.get(chatId);
        if (callback) {
            await this.syncChat(chatId, callback);
        }
    }

    getSyncStatus(chatId) {
        return {
            isSyncing: this.syncQueue.has(`chat_${chatId}`),
            lastSync: this.lastSyncTimes.get(chatId),
            hasCallback: this.syncCallbacks.has(chatId)
        };
    }

    stopAllSync() {
        for (const interval of this.syncIntervals.values()) {
            clearInterval(interval);
        }

        this.syncIntervals.clear();
        this.syncCallbacks.clear();
        this.syncQueue.clear();
        this.lastSyncTimes.clear();
    }

    resetSync() {
        this.stopAllSync();
    }
}

const syncManager = new SyncManager();

window.addEventListener('online', () => {
    console.log('网络恢复，重新开始同步');
});

window.addEventListener('beforeunload', () => {
    syncManager.stopAllSync();
});

window.SyncManager = SyncManager;
window.syncManager = syncManager;
