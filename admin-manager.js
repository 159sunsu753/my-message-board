class AdminManager {
    constructor() {
        this.currentPage = 'keys';
        this.currentChat = null;
        this.messageRefreshInterval = null;
        this.init();
    }

    async init() {
        if (!checkAdminAuth()) return;
        this.setAdminName();
        this.bindEvents();
        await this.loadDashboardData();
        await this.updateQuickStats();
    }

    setAdminName() {
        try {
            const adminAuth = JSON.parse(sessionStorage.getItem('adminAuth'));
            document.getElementById('admin-name').textContent = adminAuth.username;
        } catch (error) {
            console.error('设置管理员名称错误:', error);
        }
    }

    bindEvents() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchPage(e.target.dataset.page);
            });
        });

        document.getElementById('create-key-btn').addEventListener('click', () => {
            this.toggleCreateKeyForm();
        });

        document.getElementById('confirm-create-btn').addEventListener('click', () => {
            this.createNewKey();
        });

        document.getElementById('confirm-create-modal').addEventListener('click', () => {
            this.confirmCreateKey();
        });

        document.getElementById('cancel-create').addEventListener('click', () => {
            this.hideCreateKeyModal();
        });

        document.getElementById('change-password-btn').addEventListener('click', () => {
            this.changeAdminPassword();
        });

        document.getElementById('logout-admin').addEventListener('click', () => {
            this.logout();
        });

        document.getElementById('back-to-admin').addEventListener('click', () => {
            this.showAdminPanel();
        });

        // 管理员发送消息事件
        document.getElementById('admin-send-btn').addEventListener('click', () => {
            this.sendAdminMessage();
        });

        document.getElementById('admin-message-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (e.shiftKey) {
                    return;
                } else {
                    e.preventDefault();
                    this.sendAdminMessage();
                }
            }
        });

        // 自动调整输入框高度
        document.getElementById('admin-message-input').addEventListener('input', () => {
            this.adjustTextareaHeight(document.getElementById('admin-message-input'));
        });
    }

    adjustTextareaHeight(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    switchPage(page) {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.page === page);
        });

        document.querySelectorAll('.admin-page').forEach(pageEl => {
            pageEl.classList.toggle('active', pageEl.id === `${page}-page`);
        });

        this.currentPage = page;

        switch (page) {
            case 'keys':
                this.loadKeysList();
                break;
            case 'chats':
                this.loadChatsList();
                break;
            case 'settings':
                this.loadSettings();
                break;
        }
    }

    toggleCreateKeyForm() {
        const form = document.querySelector('.create-key-form');
        const isVisible = form.style.display !== 'none';
        form.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) {
            document.getElementById('new-key-name').focus();
        }
    }

    async createNewKey() {
        const keyName = document.getElementById('new-key-name').value.trim();
        const keyValue = document.getElementById('new-key-value').value.trim();

        if (!keyName || !keyValue) {
            showAlert('请填写密钥名称和内容', 'error');
            return;
        }

        document.getElementById('preview-name').textContent = keyName;
        document.getElementById('preview-key').textContent = keyValue;
        document.getElementById('create-key-modal').style.display = 'flex';
    }

    async confirmCreateKey() {
        const keyName = document.getElementById('new-key-name').value.trim();
        const keyValue = document.getElementById('new-key-value').value.trim();

        try {
            showAlert('创建密钥中...', 'info');
            await createNewSecretKey(keyName, keyValue);
            showAlert('密钥创建成功！', 'success');
            
            document.getElementById('new-key-name').value = '';
            document.getElementById('new-key-value').value = '';
            this.toggleCreateKeyForm();
            this.hideCreateKeyModal();
            
            await this.loadKeysList();
            await this.updateQuickStats();
            
        } catch (error) {
            console.error('创建密钥错误:', error);
            showAlert('创建失败: ' + error.message, 'error');
        }
    }

    hideCreateKeyModal() {
        document.getElementById('create-key-modal').style.display = 'none';
    }

    async loadKeysList() {
        try {
            const chats = await getAllChats();
            const keyList = document.getElementById('key-list');
            
            if (chats.length === 0) {
                keyList.innerHTML = '<div class="no-keys">暂无密钥，请创建第一个密钥</div>';
                return;
            }

            keyList.innerHTML = chats.map(chat => `
                <div class="key-item" data-chat-id="${chat.id}">
                    <div class="key-header">
                        <span class="key-name">${chat.name}</span>
                        <span class="key-status active">活跃</span>
                    </div>
                    <div class="key-value">${chat.secretKey}</div>
                    <div class="key-actions">
                        <button class="action-btn chat-btn" onclick="adminManager.openChat(${chat.id}, '${chat.secretKey}')">
                            💬 进入对话
                        </button>
                        <button class="action-btn delete-btn" onclick="adminManager.deleteKey(${chat.id})">
                            🗑️ 删除
                        </button>
                    </div>
                    <div class="key-meta">
                        创建: ${new Date(chat.createdAt).toLocaleDateString('zh-CN')}
                    </div>
                </div>
            `).join('');
            
        } catch (error) {
            console.error('加载密钥列表错误:', error);
            document.getElementById('key-list').innerHTML = '<div class="error">加载失败</div>';
        }
    }

    async loadChatsList() {
        try {
            const chats = await getAllChats();
            const chatList = document.getElementById('chat-list');
            
            if (chats.length === 0) {
                chatList.innerHTML = '<div class="no-keys">暂无对话</div>';
                return;
            }

            const chatsWithMessages = await Promise.all(
                chats.map(async (chat) => {
                    try {
                        const messages = await getChatMessages(chat.id);
                        const lastMessage = messages[messages.length - 1];
                        return {
                            ...chat,
                            lastMessage: lastMessage ? {
                                content: lastMessage.body.length > 50 ? 
                                    lastMessage.body.substring(0, 50) + '...' : lastMessage.body,
                                time: lastMessage.created_at,
                                author: lastMessage.user.login
                            } : null,
                            messageCount: messages.length
                        };
                    } catch (error) {
                        return { ...chat, lastMessage: null, messageCount: 0 };
                    }
                })
            );

            chatList.innerHTML = chatsWithMessages.map(chat => `
                <div class="chat-item" data-chat-id="${chat.id}">
                    <div class="chat-header">
                        <span class="chat-name">${chat.name}</span>
                        <span class="message-count">${chat.messageCount} 条消息</span>
                    </div>
                    <div class="chat-key">密钥: ${chat.secretKey}</div>
                    ${chat.lastMessage ? `
                        <div class="last-message">
                            <strong>${chat.lastMessage.author}:</strong>
                            ${chat.lastMessage.content}
                        </div>
                        <div class="message-time">
                            ${new Date(chat.lastMessage.time).toLocaleString('zh-CN')}
                        </div>
                    ` : '<div class="no-messages">暂无消息</div>'}
                    <div class="chat-actions">
                        <button class="action-btn primary-btn" 
                                onclick="adminManager.openChat(${chat.id}, '${chat.secretKey}')">
                            💬 查看对话
                        </button>
                    </div>
                </div>
            `).join('');
            
        } catch (error) {
            console.error('加载对话列表错误:', error);
            document.getElementById('chat-list').innerHTML = '<div class="error">加载失败</div>';
        }
    }

    async loadSettings() {
        try {
            const config = await getAdminConfig();
            const username = simpleDecrypt(config.admin.username);
            
            document.getElementById('current-username').value = username;
            document.getElementById('repo-info').textContent = `${CONFIG.owner}/${CONFIG.repo}`;
            
            const chats = await getAllChats();
            document.getElementById('chat-count').textContent = chats.length;
            document.getElementById('last-sync').textContent = new Date().toLocaleString('zh-CN');
            
        } catch (error) {
            console.error('加载设置错误:', error);
            showAlert('加载设置失败', 'error');
        }
    }

    async changeAdminPassword() {
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        if (!newPassword || !confirmPassword) {
            showAlert('请填写新密码和确认密码', 'error');
            return;
        }

        if (newPassword !== confirmPassword) {
            showAlert('两次输入的密码不一致', 'error');
            return;
        }

        try {
            showAlert('更新密码中...', 'info');
            await updateAdminPassword(newPassword);
            showAlert('密码更新成功！', 'success');
            document.getElementById('new-password').value = '';
            document.getElementById('confirm-password').value = '';
        } catch (error) {
            console.error('更改密码错误:', error);
            showAlert('密码更新失败', 'error');
        }
    }

    async updateQuickStats() {
        try {
            const chats = await getAllChats();
            document.getElementById('total-keys').textContent = chats.length;
            document.getElementById('active-chats').textContent = chats.length;
            
            let totalMessages = 0;
            for (const chat of chats) {
                try {
                    const messages = await getChatMessages(chat.id);
                    totalMessages += messages.length;
                } catch (error) {
                    console.error(`获取消息数错误:`, error);
                }
            }
            document.getElementById('total-messages').textContent = totalMessages;
        } catch (error) {
            console.error('更新统计数据错误:', error);
        }
    }

    async loadDashboardData() {
        switch (this.currentPage) {
            case 'keys':
                await this.loadKeysList();
                break;
            case 'chats':
                await this.loadChatsList();
                break;
            case 'settings':
                await this.loadSettings();
                break;
        }
    }

    openChat(issueNumber, secretKey) {
        this.currentChat = { issueNumber, secretKey };
        
        document.getElementById('current-chat-title').textContent = `对话: ${secretKey}`;
        this.showChatPanel();
        
        // 加载对话消息
        this.loadChatMessages(issueNumber);
        
        // 开始自动刷新
        this.startChatAutoRefresh(issueNumber);
    }

    async loadChatMessages(issueNumber) {
        try {
            const messages = await getChatMessages(issueNumber);
            this.displayChatMessages(messages);
        } catch (error) {
            console.error('加载对话消息错误:', error);
            this.showChatErrorMessage('加载消息失败: ' + error.message);
        }
    }

    displayChatMessages(messages) {
        const messageList = document.getElementById('admin-message-list');
        
        if (messages.length === 0) {
            messageList.innerHTML = `
                <div class="welcome-message">
                    <div class="welcome-avatar">👋</div>
                    <div class="welcome-content">
                        <h3>开始对话</h3>
                        <p>这是管理员对话界面，您可以在这里回复用户消息</p>
                    </div>
                </div>
            `;
            return;
        }

        const messagesHTML = messages.map((msg) => {
            const time = new Date(msg.created_at).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit'
            });
            const isOwnMessage = msg.user.login === CONFIG.owner;
            
            return `
                <div class="admin-message ${isOwnMessage ? 'admin-own-message' : 'admin-other-message'}">
                    <div class="admin-message-bubble">
                        <div class="admin-message-header">
                            <span class="admin-message-sender">${msg.user.login}</span>
                            <span class="admin-message-time">${time}</span>
                        </div>
                        <div class="admin-message-content">${formatMessageContent(msg.body)}</div>
                    </div>
                </div>
            `;
        }).join('');

        messageList.innerHTML = messagesHTML;
        this.scrollChatToBottom();
    }

    async sendAdminMessage() {
        const input = document.getElementById('admin-message-input');
        const message = input.value.trim();
        
        if (!message) {
            showAlert('请输入消息内容', 'error');
            return;
        }

        if (!this.currentChat) {
            showAlert('未选择对话', 'error');
            return;
        }

        const sendBtn = document.getElementById('admin-send-btn');
        const originalHTML = sendBtn.innerHTML;
        
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
            
            // 重新加载消息
            await this.loadChatMessages(this.currentChat.issueNumber);
            
        } catch (error) {
            console.error('发送消息错误:', error);
            showAlert('发送失败: ' + error.message, 'error');
        } finally {
            sendBtn.disabled = false;
            sendBtn.innerHTML = originalHTML;
            input.focus();
        }
    }

    showChatErrorMessage(message) {
        const messageList = document.getElementById('admin-message-list');
        messageList.innerHTML = `
            <div class="error-message">
                <div class="error-icon">⚠️</div>
                <div class="error-text">${message}</div>
                <button onclick="adminManager.loadChatMessages(${this.currentChat?.issueNumber})" class="retry-btn">重新加载</button>
            </div>
        `;
    }

    scrollChatToBottom() {
        const messageList = document.getElementById('admin-message-list');
        setTimeout(() => {
            messageList.scrollTop = messageList.scrollHeight;
        }, 100);
    }

    startChatAutoRefresh(issueNumber) {
        // 停止之前的刷新
        if (this.messageRefreshInterval) {
            clearInterval(this.messageRefreshInterval);
        }

        // 开始新的刷新
        this.messageRefreshInterval = setInterval(async () => {
            if (this.currentChat && this.currentChat.issueNumber === issueNumber) {
                try {
                    await this.loadChatMessages(issueNumber);
                } catch (error) {
                    console.error('自动刷新消息错误:', error);
                }
            }
        }, 5000);
    }

    showChatPanel() {
        document.getElementById('welcome-panel').style.display = 'none';
        document.getElementById('chat-panel').style.display = 'block';
    }

    showAdminPanel() {
        document.getElementById('chat-panel').style.display = 'none';
        document.getElementById('welcome-panel').style.display = 'block';
        
        // 停止自动刷新
        if (this.messageRefreshInterval) {
            clearInterval(this.messageRefreshInterval);
            this.messageRefreshInterval = null;
        }
        
        this.loadDashboardData();
        this.updateQuickStats();
    }

    async deleteKey(chatId) {
        if (!confirm('确定要删除这个密钥吗？此操作不可逆。')) {
            return;
        }

        try {
            showAlert('删除密钥中...', 'info');
            const config = await getAdminConfig();
            const chatIndex = config.chats.findIndex(chat => chat.id === chatId);
            
            if (chatIndex !== -1) {
                config.chats[chatIndex].active = false;
                await updateConfig(config);
                showAlert('密钥已删除', 'success');
                await this.loadKeysList();
                await this.updateQuickStats();
            }
        } catch (error) {
            console.error('删除密钥错误:', error);
            showAlert('删除失败', 'error');
        }
    }

    logout() {
        // 停止自动刷新
        if (this.messageRefreshInterval) {
            clearInterval(this.messageRefreshInterval);
        }
        
        sessionStorage.removeItem('adminAuth');
        sessionStorage.removeItem('githubToken');
        sessionStorage.removeItem('currentChat');
        window.location.href = 'admin-login.html';
    }
}

const adminManager = new AdminManager();
