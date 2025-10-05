// 认证管理器
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.token = null;
        this.loginAttempts = 0;
        this.init();
    }

    init() {
        this.restoreSession();
        this.setupAutoLogout();
    }

    // 恢复会话
    restoreSession() {
        try {
            const adminAuth = SystemUtils.getSessionData('adminAuth');
            const githubToken = SystemUtils.getSessionData('githubToken');

            if (adminAuth && githubToken) {
                this.currentUser = adminAuth;
                this.token = githubToken;
                SYSTEM_STATE.adminLoggedIn = true;
                
                console.log('会话恢复成功:', this.currentUser.username);
            }
        } catch (error) {
            console.error('恢复会话错误:', error);
            this.clearAuth();
        }
    }

    // 管理员登录
    async adminLogin(username, password) {
        // 检查登录尝试次数
        if (this.loginAttempts >= SYSTEM_CONFIG.SECURITY.maxLoginAttempts) {
            throw new Error('登录尝试次数过多，请稍后重试');
        }

        try {
            // 验证凭据
            const isValid = await this.verifyCredentials(username, password);
            
            if (isValid) {
                // 登录成功
                this.currentUser = {
                    username: username,
                    loginTime: new Date().toISOString(),
                    lastActivity: Date.now()
                };

                // 保存会话
                SystemUtils.setSessionData('adminAuth', this.currentUser);
                
                // 重置登录尝试计数
                this.loginAttempts = 0;
                
                SYSTEM_STATE.adminLoggedIn = true;
                
                console.log('管理员登录成功:', username);
                return { success: true, user: this.currentUser };
            } else {
                this.loginAttempts++;
                throw new Error('账号或密码错误');
            }

        } catch (error) {
            this.loginAttempts++;
            throw error;
        }
    }

    // 验证凭据
    async verifyCredentials(username, password) {
        // 输入验证
        if (!SystemUtils.isValidUsername(username)) {
            throw new Error('账号格式无效');
        }

        if (!SystemUtils.isValidPassword(password)) {
            throw new Error('密码长度至少6位');
        }

        try {
            const config = await getAdminConfig();
            
            const storedUsername = SystemUtils.decrypt(config.admin.username);
            const storedPassword = SystemUtils.decrypt(config.admin.password);
            
            return storedUsername === username && storedPassword === password;
        } catch (error) {
            if (error.message.includes('未初始化')) {
                // 首次使用，自动初始化系统
                await initializeSystem(username, password);
                return true;
            }
            throw error;
        }
    }

    // 设置GitHub Token
    async setGitHubToken(token) {
        if (!token || !token.startsWith('ghp_')) {
            throw new Error('无效的GitHub Token格式');
        }

        try {
            // 验证Token有效性
            const isValid = await this.validateGitHubToken(token);
            if (!isValid) {
                throw new Error('GitHub Token无效或权限不足');
            }

            this.token = token;
            SystemUtils.setSessionData('githubToken', token);
            
            console.log('GitHub Token设置成功');
            return true;

        } catch (error) {
            console.error('设置GitHub Token错误:', error);
            throw error;
        }
    }

    // 验证GitHub Token
    async validateGitHubToken(token) {
        try {
            const response = await apiClient.get('/user', token);
            return response && response.login;
        } catch (error) {
            return false;
        }
    }

    // 获取GitHub Token（带提示）
    async getGitHubToken() {
        if (this.token) {
            // 验证Token是否仍然有效
            const isValid = await this.validateGitHubToken(this.token);
            if (isValid) {
                return this.token;
            }
        }

        // Token无效或不存在，请求用户输入
        return this.promptForGitHubToken();
    }

    // 提示输入GitHub Token
    async promptForGitHubToken() {
        return new Promise((resolve, reject) => {
            // 创建自定义模态框而不是使用原生prompt
            const modal = this.createTokenModal();
            document.body.appendChild(modal);

            const confirmBtn = modal.querySelector('#confirm-token-btn');
            const cancelBtn = modal.querySelector('#cancel-token-btn');
            const tokenInput = modal.querySelector('#github-token-input');

            const cleanup = () => {
                modal.remove();
            };

            const confirmHandler = async () => {
                const token = tokenInput.value.trim();
                if (!token) {
                    showAlert('请输入GitHub Token', 'error');
                    return;
                }

                try {
                    await this.setGitHubToken(token);
                    cleanup();
                    resolve(token);
                } catch (error) {
                    showAlert(error.message, 'error');
                    tokenInput.focus();
                }
            };

            const cancelHandler = () => {
                cleanup();
                reject(new Error('用户取消输入Token'));
            };

            confirmBtn.addEventListener('click', confirmHandler);
            cancelBtn.addEventListener('click', cancelHandler);

            // Enter键确认
            tokenInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    confirmHandler();
                }
            });

            tokenInput.focus();
        });
    }

    // 创建Token输入模态框
    createTokenModal() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>🔑 输入GitHub Token</h3>
                <div class="token-instructions">
                    <p>需要GitHub Personal Access Token来访问仓库。</p>
                    <p><strong>所需权限:</strong> repo (全部)</p>
                    <a href="https://github.com/settings/tokens/new" target="_blank" class="token-link">
                        🔗 创建新的Token
                    </a>
                </div>
                <input type="password" id="github-token-input" placeholder="ghp_..." class="token-input">
                <div class="modal-actions">
                    <button id="confirm-token-btn" class="primary-btn">确认</button>
                    <button id="cancel-token-btn" class="secondary-btn">取消</button>
                </div>
            </div>
        `;
        return modal;
    }

    // 检查认证状态
    checkAuth() {
        if (!SYSTEM_STATE.adminLoggedIn || !this.currentUser) {
            return false;
        }

        // 检查会话是否过期
        const sessionAge = Date.now() - this.currentUser.lastActivity;
        if (sessionAge > SYSTEM_CONFIG.SYSTEM.sessionTimeout) {
            this.logout('会话已过期');
            return false;
        }

        // 更新最后活动时间
        this.updateLastActivity();
        return true;
    }

    // 更新最后活动时间
    updateLastActivity() {
        if (this.currentUser) {
            this.currentUser.lastActivity = Date.now();
            SystemUtils.setSessionData('adminAuth', this.currentUser);
        }
    }

    // 设置自动登出
    setupAutoLogout() {
        // 监听用户活动
        const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
        
        const resetTimer = () => {
            if (this.currentUser) {
                this.updateLastActivity();
            }
        };

        activityEvents.forEach(event => {
            document.addEventListener(event, resetTimer, { passive: true });
        });

        // 定期检查会话
        setInterval(() => {
            if (this.currentUser && !this.checkAuth()) {
                this.logout('会话超时');
            }
        }, 60000); // 每分钟检查一次
    }

    // 登出
    logout(reason = '用户主动登出') {
        console.log(`管理员登出: ${reason}`);
        
        // 取消所有网络请求
        apiClient.cancelAllRequests();
        
        // 清除认证数据
        this.clearAuth();
        
        // 显示登出消息
        if (reason !== '用户主动登出') {
            showAlert(reason, 'warning');
        }
        
        // 跳转到登录页
        setTimeout(() => {
            window.location.href = 'admin-login.html';
        }, 1000);
    }

    // 清除认证数据
    clearAuth() {
        this.currentUser = null;
        this.token = null;
        SYSTEM_STATE.adminLoggedIn = false;
        
        SystemUtils.clearSessionData();
    }

    // 获取当前用户信息
    getCurrentUser() {
        return this.currentUser ? { ...this.currentUser } : null;
    }

    // 检查权限
    hasPermission(permission) {
        // 简单的权限检查，可以根据需要扩展
        return this.currentUser !== null;
    }
}

// 创建全局认证管理器实例
const authManager = new AuthManager();

// 页面可见性变化处理
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && authManager.currentUser) {
        authManager.updateLastActivity();
    }
});

// 导出到全局
window.AuthManager = AuthManager;
window.authManager = authManager;
