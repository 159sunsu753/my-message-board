// === 系统配置 ===
const CONFIG = {
    owner: '159sunsu753',
    repo: 'my-message-board',
    apiBase: 'https://api.github.com',
    CONFIG_ISSUE_NUMBER: 1
};

// === 工具函数 ===
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

async function githubApiRequest(url, options = {}) {
    const response = await fetch(`${CONFIG.apiBase}${url}`, {
        headers: {
            'Accept': 'application/vnd.github.v3+json',
            ...options.headers
        },
        ...options
    });
    
    if (!response.ok) {
        throw new Error(`API错误: ${response.status}`);
    }
    
    return response.json();
}

// === 管理员账号管理 ===
async function getAdminConfig() {
    try {
        const issue = await githubApiRequest(
            `/repos/${CONFIG.owner}/${CONFIG.repo}/issues/${CONFIG.CONFIG_ISSUE_NUMBER}`
        );
        
        const configMatch = issue.body.match(/```json\n({[\s\S]*?})\n```/);
        if (configMatch) {
            return JSON.parse(configMatch[1]);
        }
        throw new Error('配置格式错误');
    } catch (error) {
        if (error.message.includes('404')) {
            throw new Error('系统未初始化');
        }
        throw error;
    }
}

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

    const issueBody = `# 系统配置\n\n\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``;

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

async function verifyAdminCredentials(username, password) {
    try {
        const config = await getAdminConfig();
        const storedUsername = simpleDecrypt(config.admin.username);
        const storedPassword = simpleDecrypt(config.admin.password);
        return storedUsername === username && storedPassword === password;
    } catch (error) {
        if (error.message.includes('未初始化')) {
            await initializeSystem(username, password);
            return true;
        }
        throw error;
    }
}

async function updateAdminPassword(newPassword) {
    const config = await getAdminConfig();
    config.admin.password = simpleEncrypt(newPassword);
    config.admin.updatedAt = new Date().toISOString();

    const issueBody = `# 系统配置\n\n\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``;

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
async function createNewSecretKey(keyName, secretKey) {
    const config = await getAdminConfig();
    
    const issueBody = `# 对话: ${keyName}\n\n**密钥:** ${secretKey}\n**创建时间:** ${new Date().toLocaleString('zh-CN')}\n**状态:** 活跃`;
    
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

    config.chats.push({
        id: issue.number,
        name: keyName,
        secretKey: secretKey,
        createdAt: new Date().toISOString(),
        active: true
    });

    await updateConfig(config);
    return issue;
}

async function getAllChats() {
    const config = await getAdminConfig();
    return config.chats.filter(chat => chat.active !== false);
}

async function findChatBySecretKey(secretKey) {
    const chats = await getAllChats();
    return chats.find(chat => chat.secretKey === secretKey);
}

async function updateConfig(config) {
    const issueBody = `# 系统配置\n\n\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``;

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
async function getChatMessages(issueNumber) {
    const comments = await githubApiRequest(
        `/repos/${CONFIG.owner}/${CONFIG.repo}/issues/${issueNumber}/comments?per_page=100`
    );
    return comments.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

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
async function getAdminToken() {
    let token = sessionStorage.getItem('githubToken');
    if (!token) {
        token = prompt('请输入GitHub Personal Access Token（需要repo权限）:');
        if (!token) {
            throw new Error('需要GitHub Token才能执行此操作');
        }
        sessionStorage.setItem('githubToken', token);
    }
    return token;
}

function checkAdminAuth() {
    const adminAuth = sessionStorage.getItem('adminAuth');
    if (!adminAuth) {
        window.location.href = 'admin-login.html';
        return false;
    }
    return true;
}

function formatMessageContent(content) {
    if (!content) return '';
    const div = document.createElement('div');
    div.textContent = content;
    return div.innerHTML.replace(/\n/g, '<br>');
}

// 导出到全局
window.getAdminConfig = getAdminConfig;
window.initializeSystem = initializeSystem;
window.verifyAdminCredentials = verifyAdminCredentials;
window.updateAdminPassword = updateAdminPassword;
window.createNewSecretKey = createNewSecretKey;
window.getAllChats = getAllChats;
window.findChatBySecretKey = findChatBySecretKey;
window.getChatMessages = getChatMessages;
window.sendChatMessage = sendChatMessage;
window.getAdminToken = getAdminToken;
window.checkAdminAuth = checkAdminAuth;
window.formatMessageContent = formatMessageContent;
