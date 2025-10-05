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
        console.log('聊天管理器初始化完成');
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
            this.showErrorMessage('未找到对话信息，请重新登录');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 3000);
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
    }

    bindEvents() {
        const sendBtn = document.getElementById('send-btn');
        const messageInput = document.getElementById('message-input');

        sendBtn.addEventListener('click', () => {
            this.sendMessage();
        });

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

        messageInput.addEventListener('input', () => {
            this.adjustTextareaHeight(messageInput);
        });

        document.getElementById('back-btn').addEventListener('click', () => {
            this.goBack();
        });

        messageInput.addEventListener('focus', () => {
            this.scrollToBottom();
        });
    }

    adjustTextareaHeight(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    async loadMessages() {
        if (!this.currentChat) return;

        try {
            this.showLoadingState();
            const messages = await getChatMessages(this.currentChat.issueNumber);
            this.displayMessages(messages);
            this.lastMessageCount = messages.length;
        } catch (error) {
            console.error('加载消息错误:', error);
            if (error.message.includes('频率限制')) {
                this.showRateLimitError();
            } else if (error.message.includes('不存在')) {
                this.showNotFoundError();
            } else {
                this.showErrorMessage('加载消息失败: ' + error.message);
            }
        }
    }

    showLoadingState() {
        const messageList = document.getElementById('message-list');
        if (!messageList.querySelector('.loading-messages')) {
            messageList.innerHTML += `
                <div class="loading-messages">
                    <div class="typing-indicator">
                        <span>加载中</span>
                        <div class="typing-dots">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    displayMessages(messages) {
        const messageList = document.getElementById('message-list');
        
        const loadingElement = messageList.querySelector('.loading-messages');
        if (loadingElement) {
            loadingElement.remove();
        }

        const errorElement = messageList.querySelector('.error-message');
        if (errorElement) {
            errorElement.remove();
        }

        if (messages.length === 0) {
            return;
        }

        const messagesHTML = messages.map((msg) => {
            const time = new Date(msg.created_at).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit'
            });
            const isOwnMessage = msg.user.login === CONFIG.owner;
            
            return `
                <div class="message ${isOwnMessage ? 'own-message' : 'other-message'}">
                    <div class="message-bubble">
                        <div class="message-header">
                            <span class="message-sender">${msg.user.login}</span>
                            <span class="message-time">${time}</span>
                        </div>
                        <div class="message-content">${this.formatMessageContent(msg.body)}</div>
                    </div>
                </div>
            `;
        }).join('');

        messageList.innerHTML += messagesHTML;
        
        const hasNewMessages = messages.length > this.lastMessageCount;
        if (hasNewMessages || this.lastMessageCount === 0) {
            this.scrollToBottom();
        }
        
        this.lastMessageCount = messages.length;
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
            '<a href="$1" target="_blank" rel="noopener" style="color: inherit; text-decoration: underline;">$1</a>'
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
        const originalText = sendBtn.innerHTML;
        
        sendBtn.disabled = true;
        sendBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10.72,19.9a8,8,0,0,1-6.5-9.79A7.77,7.77,0,0,1,10.4,4.16a8,8,0,0,1,9.49,6.52A1.54,1.54,0,0,0,21.38,12h.13a1.37,1.37,0,0,0,1.38-1.54,11,11,0,1,0-12.7,12.39A1.54,1.54,0,0,0,12,21.34h0A1.47,1.47,0,0,0,10.72,19.9Z">
                    <animateTransform attributeName="transform" type="rotate" dur="0.75s" values="0 12 12;360 12 12" repeatCount="indefinite"/>
                </path>
            </svg>
        `;

        try {
            await sendChatMessage(this.currentChat.issueNumber, message);
            
            input.value = '';
            this.adjustTextareaHeight(input);
            
            showAlert('消息已发送', 'success');
            
            await this.loadMessages();
            
        } catch (error) {
            console.error('发送消息错误:', error);
            if (error.message.includes('频率限制')) {
                showAlert('API频率限制，请稍后重试或使用Token认证', 'error');
            } else {
                showAlert('发送失败: ' + error.message, 'error');
            }
        } finally {
            sendBtn.disabled = false;
            sendBtn.innerHTML = originalText;
            input.focus();
        }
    }

    showRateLimitError() {
        const messageList = document.getElementById('message-list');
        messageList.innerHTML = `
            <div class="error-message">
                <div class="error-icon">⏰</div>
                <div class="error-text">GitHub API频率限制</div>
                <p style="color: #666; margin: 10px 0; font-size: 14px;">
                    请求过于频繁，请：
                </p>
                <ul style="text-align: left; color: #666; margin: 10px 0;">
                    <li>使用GitHub Token认证</li>
                    <li>等待几分钟后重试</li>
                    <li>减少自动刷新频率</li>
                </ul>
                <button onclick="chatManager.loadMessages()" class="retry-btn">重新加载</button>
            </div>
        `;
    }

    showNotFoundError() {
        const messageList = document.getElementById('message-list');
        messageList.innerHTML = `
            <div class="error-message">
                <div class="error-icon">🔍</div>
                <div class="error-text">对话不存在</div>
                <p style="color: #666; margin: 10px 0; font-size: 14px;">
                    此对话可能已被删除或密钥已失效
                </p>
                <button onclick="chatManager.goBack()" class="retry-btn">返回</button>
            </div>
        `;
    }

    showErrorMessage(message) {
        const messageList = document.getElementById('message-list');
        messageList.innerHTML = `
            <div class="error-message">
                <div class="error-icon">⚠️</div>
                <div class="error-text">${message}</div>
                <button onclick="chatManager.loadMessages()" class="retry-btn">重新加载</button>
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
        }, 5000); // 降低到5秒一次，减少API调用
    }

    stopAutoRefresh() {
        if (this.messageRefreshInterval) {
            clearInterval(this.messageRefreshInterval);
        }
    }

    goBack() {
        if (this.userType === 'admin') {
            window.location.href = 'admin.html';
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
