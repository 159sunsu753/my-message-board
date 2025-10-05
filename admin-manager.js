class AdminManager {
    constructor() {
        this.currentPage = 'keys';
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
        // 在新窗口打开独立对话页面
        const chatUrl = `admin-chat.html?issue=${issueNumber}&key=${encodeURIComponent(secretKey)}`;
        window.open(chatUrl, '_blank', 'width=800,height=700,resizable=yes,scrollbars=yes');
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
        sessionStorage.removeItem('adminAuth');
        sessionStorage.removeItem('githubToken');
        sessionStorage.removeItem('currentChat');
        window.location.href = 'admin-login.html';
    }
}

const adminManager = new AdminManager();
