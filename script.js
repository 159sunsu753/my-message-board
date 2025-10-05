// === 系统配置 ===
const CONFIG = {
    owner: '159sunsu753', // 您的GitHub用户名
    repo: 'my-message-board', // 仓库名
    apiBase: 'https://api.github.com'
};

// === 通用工具函数 ===

// 显示提示信息
function showAlert(message, type = 'info') {
    // 移除现有提示
    const existingAlert = document.querySelector('.custom-alert');
    if (existingAlert) {
        existingAlert.remove();
    }

    // 创建新提示
    const alert = document.createElement('div');
    alert.className = `custom-alert ${type}`;
    alert.textContent = message;
    
    document.body.appendChild(alert);

    // 自动消失
    setTimeout(() => {
        if (alert.parentNode) {
            alert.remove();
        }
    }, type === 'error' ? 5000 : 3000);
}

// GitHub API 请求封装
async function githubApiRequest(url, options = {}) {
    const defaultOptions = {
        headers: {
            'Accept': 'application/vnd.github.v3+json',
            ...options.headers
        }
    };

    const response = await fetch(`${CONFIG.apiBase}${url}`, { ...defaultOptions, ...options });
    
    if (!response.ok) {
        throw new Error(`GitHub API 错误: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
}

// === 密钥管理功能 ===

// 创建新密钥（Issue）
async function createNewIssue(keyName, secretKey, token) {
    const issueTitle = `密钥: ${keyName}`;
    const issueBody = `🔐 密钥对话线程\n\n**密钥:** ${secretKey}\n**创建时间:** ${new Date().toLocaleString('zh-CN')}\n\n此Issue用于存储与密钥 "${secretKey}" 相关的所有对话。`;

    const issue = await githubApiRequest(`/repos/${CONFIG.owner}/${CONFIG.repo}/issues`, {
        method: 'POST',
        headers: {
            'Authorization': `token ${token}`
        },
        body: JSON.stringify({
            title: issueTitle,
            body: issueBody,
            labels: ['secret-chat']
        })
    });

    return issue;
}

// 获取所有Issue（密钥列表）
async function getAllIssues() {
    try {
        const issues = await githubApiRequest(`/repos/${CONFIG.owner}/${CONFIG.repo}/issues?state=all&per_page=100`);
        // 过滤出密钥相关的Issue
        return issues.filter(issue => issue.title.startsWith('密钥:'));
    } catch (error) {
        console.error('获取Issue列表错误:', error);
        throw error;
    }
}

// 根据密钥查找Issue
async function findIssueBySecretKey(secretKey) {
    try {
        const issues = await getAllIssues();
        
        for (const issue of issues) {
            // 从Issue内容中提取密钥
            const issueSecretKey = extractSecretKeyFromIssue(issue);
            if (issueSecretKey === secretKey) {
                return issue;
            }
        }
        
        return null; // 未找到匹配的密钥
    } catch (error) {
        console.error('查找密钥错误:', error);
        throw error;
    }
}

// 从Issue内容中提取密钥
function extractSecretKeyFromIssue(issue) {
    // 从Issue body中提取密钥
    const keyMatch = issue.body.match(/\*\*密钥:\*\*\s*([^\n]+)/);
    if (keyMatch && keyMatch[1]) {
        return keyMatch[1].trim();
    }
    
    // 备用方案：从标题中提取（用于旧版本兼容）
    const titleMatch = issue.title.match(/密钥:\s*(.+)/);
    if (titleMatch && titleMatch[1]) {
        return titleMatch[1].trim();
    }
    
    return '未知密钥';
}

// === 对话管理功能 ===

// 获取Issue的所有评论（对话记录）
async function getIssueComments(issueNumber) {
    try {
        const comments = await githubApiRequest(
            `/repos/${CONFIG.owner}/${CONFIG.repo}/issues/${issueNumber}/comments?per_page=100`
        );
        
        // 按时间排序
        return comments.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } catch (error) {
        console.error('获取评论错误:', error);
        throw error;
    }
}

// 发布新评论（发送消息）
async function postComment(issueNumber, message, token) {
    if (!token) {
        throw new Error('需要GitHub Token才能发送消息');
    }

    try {
        await githubApiRequest(`/repos/${CONFIG.owner}/${CONFIG.repo}/issues/${issueNumber}/comments`, {
            method: 'POST',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                body: message
            })
        });

        return true;
    } catch (error) {
        console.error('发送消息错误:', error);
        throw error;
    }
}

// 检查新消息（用于实时同步）
async function checkForNewMessages(issueNumber, lastChecked) {
    try {
        const comments = await getIssueComments(issueNumber);
        const newMessages = comments.filter(comment => 
            new Date(comment.created_at) > new Date(lastChecked)
        );
        
        return {
            hasNew: newMessages.length > 0,
            messages: newMessages,
            lastChecked: new Date().toISOString()
        };
    } catch (error) {
        console.error('检查新消息错误:', error);
        return { hasNew: false, messages: [], lastChecked };
    }
}

// === 数据同步功能 ===

// 保存对话状态到本地存储
function saveChatState(issueNumber, secretKey, userType, lastSync = null) {
    const chatState = {
        issueNumber,
        secretKey,
        userType,
        lastSync: lastSync || new Date().toISOString(),
        lastActive: new Date().toISOString()
    };
    
    localStorage.setItem(`chat_${issueNumber}`, JSON.stringify(chatState));
    localStorage.setItem('currentChat', JSON.stringify(chatState));
}

// 从本地存储加载对话状态
function loadChatState(issueNumber) {
    const saved = localStorage.getItem(`chat_${issueNumber}`);
    return saved ? JSON.parse(saved) : null;
}

// 获取所有保存的对话状态
function getAllChatStates() {
    const states = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('chat_')) {
            try {
                const state = JSON.parse(localStorage.getItem(key));
                states.push(state);
            } catch (e) {
                console.warn('解析保存的对话状态失败:', key);
            }
        }
    }
    return states;
}

// === 消息格式处理 ===

// 格式化消息内容（保留所有格式）
function formatMessageContent(content) {
    if (!content) return '';
    
    // 转义HTML但保留换行和空格
    const div = document.createElement('div');
    div.textContent = content;
    let escaped = div.innerHTML;
    
    // 保留换行
    escaped = escaped.replace(/\n/g, '<br>');
    
    // 保留连续空格（可选）
    // escaped = escaped.replace(/ /g, '&nbsp;');
    
    return escaped;
}

// 检测消息类型（文本、链接等）
function detectMessageType(content) {
    if (content.match(/https?:\/\/[^\s]+/)) {
        return 'text-with-links';
    }
    if (content.length > 200) {
        return 'long-text';
    }
    return 'text';
}

// === 实时同步管理器 ===

class SyncManager {
    constructor() {
        this.syncIntervals = new Map();
        this.syncCallbacks = new Map();
    }

    // 开始同步特定对话
    startSync(issueNumber, callback, interval = 5000) {
        this.stopSync(issueNumber);
        
        const syncInterval = setInterval(async () => {
            try {
                const lastState = loadChatState(issueNumber);
                const result = await checkForNewMessages(
                    issueNumber, 
                    lastState?.lastSync || '1970-01-01'
                );
                
                if (result.hasNew) {
                    callback(result.messages);
                    saveChatState(
                        lastState?.issueNumber || issueNumber,
                        lastState?.secretKey || 'unknown',
                        lastState?.userType || 'user',
                        result.lastChecked
                    );
                }
            } catch (error) {
                console.error('同步错误:', error);
            }
        }, interval);
        
        this.syncIntervals.set(issueNumber, syncInterval);
        this.syncCallbacks.set(issueNumber, callback);
    }

    // 停止同步
    stopSync(issueNumber) {
        const interval = this.syncIntervals.get(issueNumber);
        if (interval) {
            clearInterval(interval);
            this.syncIntervals.delete(issueNumber);
            this.syncCallbacks.delete(issueNumber);
        }
    }

    // 停止所有同步
    stopAllSync() {
        for (const interval of this.syncIntervals.values()) {
            clearInterval(interval);
        }
        this.syncIntervals.clear();
        this.syncCallbacks.clear();
    }
}

// 创建全局同步管理器实例
const syncManager = new SyncManager();

// 页面卸载时清理
window.addEventListener('beforeunload', () => {
    syncManager.stopAllSync();
});

// 导出到全局作用域
window.syncManager = syncManager;
window.CONFIG = CONFIG;
