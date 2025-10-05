class ChatManager {
    constructor() {
        this.currentChat = null;
        this.userType = 'user';
        this.messageRefreshInterval = null;
        this.lastMessageCount = 0;
        this.init();
    }

    async init() {
        await this.loadChatInfo();
        this.bindEvents();
        await this.loadMessages();
        this.startAutoRefresh();
    }

    async loadChatInfo() {
        const urlParams = new URLSearchParams(window.location.search);
        const sessionChat = sessionStorage.getItem('currentChat');
        
        if (urlParams.get('issue')) {
            this.currentChat = {
                issueNumber: parseInt(urlParams.get('issue')),
                secretKey: decodeURIComponent(urlParams.get('key')),
                userType: urlParams.get('userType') || 'user',
                chatTitle: `对话: ${decodeURIComponent(urlParams.get('key'))}`
            };
        } else if (sessionChat) {
            this.currentChat = JSON.parse(sessionChat);
        } else {
            showAlert('未找到对话信息', 'error');
            setTimeout(() => {
                window.location.href = this.currentChat?.userType === 'admin' ? 'admin.html' : 'index.html';
            }, 2000);
            return;
        }

        this.userType = this.currentChat.userType;
        this.updateUI();
    }

    updateUI() {
        document.getElementById('chat-title').textContent = this.currentChat.chatTitle || '私密对话';
        
        const userBadge = document.getElementById('user-type-badge');
        userBadge.textContent = this.userType === 'admin' ? '管理员' : '用户';
        userBadge.className = `user-badge ${this.userType}`;
        
        document.getElementById('back-text').textContent = 
            this.userType === 'admin' ? '返回管理' : '返回';
    }

    bindEvents() {
        document.getElementById('send-btn').addEventListener('click', () => {
            this.sendMessage();
        });

        const messageInput = document.getElementById('message-input');
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (e.shiftKey) {
                    return;
                } else {
                    e.preventDefault();
                    this.sendMessage();
                }
            }
        });

        document.getElementById('back-btn').addEventListener('click', () => {
            this.goBack();
        });

        messageInput.addEventListener('focus', () => {
            this.scrollToBottom();
        });
    }

    async loadMessages() {
        if (!this.currentChat) return;

        try {
            const messages = await getChatMessages(this.currentChat.issueNumber);
            this.displayMessages(messages);
            this.lastMessageCount = messages.length;
        } catch (error) {
            console.error('加载消息错误:', error);
            this.showErrorMessage('加载消息失败: ' + error.message);
        }
    }

    displayMessages(messages) {
        const messageList = document.getElementById('message-list');
        
        if (messages.length === 0) {
            messageList.innerHTML = `
                <div class="no-messages">
                    <div class="welcome-message">
                        <h3>💬 开始对话</h3>
                        <p>这是您的新对话空间，发送第一条消息开始交流吧！</p>
                        <p class="hint">消息支持换行和完整格式显示</p>
                    </div>
                </div>
            `;
            return;
        }

        const messagesHTML = messages.map((msg, index) => {
            const time = new Date(msg.created_at).toLocaleString('zh-CN');
            const isOwnMessage = msg.user.login === CONFIG.owner;
            
            return `
                <div class="message ${isOwnMessage ? 'own-message' : 'other-message'}">
                    <div class="message-header">
                        <span class="message-sender">${msg.user.login}</span>
                        <span class="message-time">${time}</span>
                    </div>
                    <div class="message-content">${this.formatMessageContent(msg.body)}</div>
                </div>
            `;
        }).join('');

        const hasNewMessages = messages.length > this.lastMessageCount;
        messageList.innerHTML = messagesHTML;
        
        if (hasNewMessages || this.lastMessageCount === 0) {
            this.scrollToBottom();
        }
    }

    formatMessageContent(content) {
        if (!content) return '';
        
        const div = document.createElement('div');
        div.textContent = content;
        let escaped = div.innerHTML;
        
        escaped = escaped.replace(/\n/g, '<br>');
        escaped = escaped.replace(/  /g, ' &nbsp;');
        
        escaped = escaped.replace(
            /(https?:\/\/[^\s<]+)/g, 
            '<a href="$1" target="_blank" rel="noopener" style="color: #2196F3; text-decoration: underline;">$1</a>'
        );
        
        return escaped;
    }

    async sendMessage() {
        const input = document.getElementById('message-input');
        const message = input.value.trim();
        
        if (!message) {
            showAlert('请输入消息内容', 'error');
            return;
        }

        const sendBtn = document.getElementById('send-btn');
        sendBtn.disabled = true;
        sendBtn.textContent = '发送中...';

        try {
            await sendChatMessage(this.currentChat.issueNumber, message);
            input.value = '';
            await this.loadMessages();
            this.showSendSuccess();
        } catch (error) {
            console.error('发送消息错误:', error);
            showAlert('发送失败: ' + error.message, 'error');
        } finally {
            sendBtn.disabled = false;
            sendBtn.textContent = '发送';
            input.focus();
        }
    }

    showSendSuccess() {
        const tempAlert = document.createElement('div');
        tempAlert.className = 'custom-alert success';
        tempAlert.textContent = '消息已发送';
        tempAlert.style.cssText = 'position: fixed; bottom: 100px; right: 20px; z-index: 1000;';
        document.body.appendChild(tempAlert);
        
        setTimeout(() => {
            if (tempAlert.parentNode) {
                tempAlert.remove();
            }
        }, 1000);
    }

    showErrorMessage(message) {
        const messageList = document.getElementById('message-list');
        messageList.innerHTML = `
            <div class="error-message">
                <div class="error-icon">⚠️</div>
                <div class="error-text">${message}</div>
                <button onclick="chatManager.loadMessages()" class="retry-btn">重试</button>
            </div>
        `;
    }

    scrollToBottom() {
        const messageList = document.getElementById('message-list');
        setTimeout(() => {
            messageList.scrollTop = messageList.scrollHeight;
        }, 100);
    }

    startAutoRefresh() {
        this.messageRefreshInterval = setInterval(async () => {
            if (!this.currentChat) return;
            
            try {
                const messages = await getChatMessages(this.currentChat.issueNumber);
                if (messages.length !== this.lastMessageCount) {
                    this.displayMessages(messages);
                    this.lastMessageCount = messages.length;
                }
            } catch (error) {
                console.error('自动刷新消息错误:', error);
            }
        }, 5000);
    }

    stopAutoRefresh() {
        if (this.messageRefreshInterval) {
            clearInterval(this.messageRefreshInterval);
            this.messageRefreshInterval = null;
        }
    }

    goBack() {
        if (this.userType === 'admin') {
            if (window.parent && window.parent.adminManager) {
                window.parent.adminManager.showAdminPanel();
            } else {
                window.location.href = 'admin.html';
            }
        } else {
            sessionStorage.removeItem('currentChat');
            window.location.href = 'index.html';
        }
    }

    destroy() {
        this.stopAutoRefresh();
    }
}

let chatManager;

document.addEventListener('DOMContentLoaded', async function() {
    chatManager = new ChatManager();
});

window.addEventListener('beforeunload', () => {
    if (chatManager) {
        chatManager.destroy();
    }
});
