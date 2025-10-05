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
            this.showErrorMessage('未找到对话信息');
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
        
        document.getElementById('back-text').textContent = 
            this.userType === 'admin' ? '返回管理' : '返回';
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
                    // Shift+Enter 换行
                    return;
                } else {
                    // Enter 发送
                    e.preventDefault();
                    this.sendMessage();
                }
            }
        });

        // 自动调整输入框高度
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
            this.showErrorMessage('加载消息失败: ' + error.message);
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
        
        // 移除加载状态
        const loadingElement = messageList.querySelector('.loading-messages');
        if (loadingElement) {
            loadingElement.remove();
        }

        if (messages.length === 0) {
            // 保留欢迎消息
            return;
        }

        // 移除旧的动态消息，保留欢迎消息
        const welcomeMessage = messageList.querySelector('.welcome-message');
        messageList.innerHTML = '';
        if (welcomeMessage) {
            messageList.appendChild(welcomeMessage);
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
        
        // 检查是否有新消息
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
        
        // 保留换行和空格
        escaped = escaped.replace(/\n/g, '<br>');
        escaped = escaped.replace(/  /g, ' &nbsp;');
        
        // 链接检测
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

        if (message.length > 10000) {
            showAlert('消息过长，请缩短内容', 'error');
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
            showAlert('发送失败: ' + error.message, 'error');
        } finally {
            sendBtn.disabled = false;
            sendBtn.innerHTML = originalText;
            input.focus();
        }
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
        }, 3000);
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
