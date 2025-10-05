// === 系统配置 ===
const CONFIG = {
    owner: '159sunsu753',
    repo: 'my-message-board',
    apiBase: 'https://api.github.com',
    // 主配置Issue编号（固定为1，用于存储管理员账号和密钥列表）
    CONFIG_ISSUE_NUMBER: 1
};

// === 通用工具函数 ===

function showAlert(message, type = 'info') {
    const existingAlert = document.querySelector('.custom-alert');
    if (existingAlert) existingAlert.remove();

    const alert = document.createElement('div');
    alert.className = `custom-alert ${type}`;
    alert.textContent = message;
    document.body.appendChild(alert);

    setTimeout(() => {
        if (alert.parentNode) alert.remove();
    }, type === 'error' ? 5000 : 3000);
}

// 简单的加密函数（Base64编码）
function simpleEncrypt(text) {
    return btoa(unescape(encodeURIComponent(text)));
}

function simpleDecrypt(encrypted) {
    try {
        return decodeURIComponent(escape(atob(encrypted)));
    } catch {
        return null;
    }
}

// GitHub API 请求
async function githubApiRequest(url, options = {}) {
    const response = await fetch(`${CONFIG.apiBase}${url}`, {
        headers: {
            'Accept': 'application/vnd.github.v3+json',
            ...options.headers
        },
        ...options
    });
    
    if (!response.ok) {
        throw new Error(`API错误: ${response.status} ${await response.text()}`);
    }
    
    return response.json();
}

// === 管理员账号管理 ===

// 获取管理员配置
async function getAdminConfig() {
    try {
        const issue = await githubApiRequest(
            `/repos/${CONFIG.owner}/${CONFIG.repo}/issues/${CONFIG.CONFIG_ISSUE_NUMBER}`
        );
        
        // 从Issue body中解析配置
        const configMatch = issue.body.match(/```json\n({[\s\S]*?})\n```/);
        if (configMatch) {
            return JSON.parse(configMatch[1]);
        }
        throw new Error('配置格式错误');
    } catch (error) {
        if (error.message.includes('404')) {
            throw new Error('系统未初始化，请先创建管理员账号');
        }
        throw error;
    }
}

// 初始化系统（首次设置）
async function initializeSystem(adminUsername, adminPassword) {
    const config = {
        admin: {
            username: simpleEncrypt(adminUsername),
            password: simpleEncrypt(adminPassword),
            createdAt: new Date().toISOString()
        },
        chats: [],
        version: '1.0'
    };

    const issueBody = `# 系统配置\n\n这是私密对话系统的配置文件，请勿修改或删除。\n\n\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``;

    try {
        const issue = await githubApiRequest(`/repos/${CONFIG.owner}/${CONFIG.repo}/issues`, {
            method: 'POST',
            headers: {
                'Authorization': `token ${await getAdminToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: '系统配置 - 请勿删除',
                body: issueBody,
                labels: ['system-config']
            })
        });
        
        return issue;
    } catch (error) {
        throw new Error('系统初始化失败: ' + error.message);
    }
}

// 验证管理员凭证
async function verifyAdminCredentials(username, password) {
    try {
        const config = await getAdminConfig();
        
        const storedUsername = simpleDecrypt(config.admin.username);
        const storedPassword = simpleDecrypt(config.admin.password);
        
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

// 更新管理员密码
async function updateAdminPassword(newPassword) {
    const config = await getAdminConfig();
    config.admin.password = simpleEncrypt(newPassword);
    config.admin.updatedAt = new Date().toISOString();

    const issueBody = `# 系统配置\n\n这是私密对话系统的配置文件，请勿修改或删除。\n\n\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``;

    await githubApiRequest(`/repos/${CONFIG.owner}/${CONFIG.repo}/issues/${CONFIG.CONFIG_ISSUE_NUMBER}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `token ${await getAdminToken()}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            body: issueBody
        })
    });
}

// === 密钥管理 ===

// 创建新密钥（创建新的Issue）
async function createNewSecretKey(keyName, secretKey) {
    const config = await getAdminConfig();
    
    // 创建对话Issue
    const issueBody = `# 对话: ${keyName}\n\n**密钥:** ${secretKey}\n**创建时间:** ${new Date().toLocaleString('zh-CN')}\n**状态:** 活跃\n\n此对话线程由密钥 "${secretKey}" 保护。`;
    
    const issue = await githubApiRequest(`/repos/${CONFIG.owner}/${CONFIG.repo}/issues`, {
        method: 'POST',
        headers: {
            'Authorization': `token ${await getAdminToken()}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            title: `对话: ${keyName}`,
            body: issueBody,
            labels: ['secret-chat']
        })
    });

    // 更新配置，记录新对话
    config.chats.push({
        id: issue.number,
        name: keyName,
        secretKey: secretKey,
        createdAt: new Date().toISOString(),
        active: true
    });

    // 保存更新后的配置
    await updateConfig(config);

    return issue;
}

// 获取所有对话列表
async function getAllChats() {
    const config = await getAdminConfig();
    return config.chats.filter(chat => chat.active !== false);
}

// 根据密钥查找对话
async function findChatBySecretKey(secretKey) {
    const chats = await getAllChats();
    return chats.find(chat => chat.secretKey === secretKey);
}

// 更新系统配置
async function updateConfig(config) {
    const issueBody = `# 系统配置\n\n这是私密对话系统的配置文件，请勿修改或删除。\n\n\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``;

    await githubApiRequest(`/repos/${CONFIG.owner}/${CONFIG.repo}/issues/${CONFIG.CONFIG_ISSUE_NUMBER}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `token ${await getAdminToken()}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            body: issueBody
        })
    });
}

// === 对话消息管理 ===

// 获取对话消息
async function getChatMessages(issueNumber) {
    const comments = await githubApiRequest(
        `/repos/${CONFIG.owner}/${CONFIG.repo}/issues/${issueNumber}/comments?per_page=100`
    );
    
    return comments.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

// 发送消息
async function sendChatMessage(issueNumber, message) {
    await githubApiRequest(`/repos/${CONFIG.owner}/${CONFIG.repo}/issues/${issueNumber}/comments`, {
        method: 'POST',
        headers: {
            'Authorization': `token ${await getAdminToken()}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            body: message
        })
    });
}

// === Token 管理 ===

// 获取管理员Token（在管理员登录后使用）
async function getAdminToken() {
    // 在实际部署中，这里应该从安全的地方获取Token
    // 现在我们先使用一个安全的方式：从管理员登录后的sessionStorage获取
    const adminAuth = sessionStorage.getItem('adminAuth');
    if (!adminAuth) {
        throw new Error('管理员未登录');
    }
    
    // 在实际系统中，您需要在这里安全地存储和管理Token
    // 这只是一个示例实现
    const token = sessionStorage.getItem('githubToken');
    if (!token) {
        // 如果还没有Token，提示用户输入
        const newToken = prompt('请输入GitHub Personal Access Token（需要repo权限）:');
        if (!newToken) {
            throw new Error('需要GitHub Token才能执行此操作');
        }
        sessionStorage.setItem('githubToken', newToken);
        return newToken;
    }
    
    return token;
}

// 检查管理员认证状态
function checkAdminAuth() {
    const adminAuth = sessionStorage.getItem('adminAuth');
    if (!adminAuth) {
        window.location.href = 'admin-login.html';
        return false;
    }
    return true;
}

// 格式消息内容（保留换行等格式）
function formatMessageContent(content) {
    if (!content) return '';
    const div = document.createElement('div');
    div.textContent = content;
    return div.innerHTML.replace(/\n/g, '<br>');
}
