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
    try {
        return btoa(unescape(encodeURIComponent(text)));
    } catch (error) {
        return text;
    }
}

function simpleDecrypt(encrypted) {
    try {
        return decodeURIComponent(escape(atob(encrypted)));
    } catch {
        return null;
    }
}

async function githubApiRequest(url, options = {}) {
    console.log('API请求:', url);
    
    try {
        const fullUrl = `${CONFIG.apiBase}${url}`;
        const requestOptions = {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                ...options.headers
            },
            ...options
        };

        console.log('请求选项:', requestOptions);

        const response = await fetch(fullUrl, requestOptions);
        
        if (!response.ok) {
            let errorText = '';
            try {
                errorText = await response.text();
            } catch (e) {
                errorText = '无法读取错误信息';
            }
            throw new Error(`API错误: ${response.status} - ${errorText || response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API请求失败:', error);
        throw error;
    }
}

// === 系统初始化 ===
async function initializeSystem(adminUsername, adminPassword) {
    console.log('开始初始化系统...');
    
    const config = {
        admin: {
            username: simpleEncrypt(adminUsername),
            password: simpleEncrypt(adminPassword),
            createdAt: new Date().toISOString()
        },
        chats: [],
        version: '2.0',
        initializedAt: new Date().toISOString()
    };

    const issueBody = `# 🔧 系统配置 - 请勿删除\n\n这是私密对话系统的配置文件。\n\n\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``;

    try {
        const token = await getAdminToken();
        const issue = await githubApiRequest(`/repos/${CONFIG.owner}/${CONFIG.repo}/issues`, {
            method: 'POST',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: '🔧 系统配置 - 请勿删除',
                body: issueBody,
                labels: ['system-config']
            })
        });
        
        console.log('系统初始化成功，Issue编号:', issue.number);
        CONFIG.CONFIG_ISSUE_NUMBER = issue.number;
        return issue;
    } catch (error) {
        console.error('系统初始化失败:', error);
        throw new Error('系统初始化失败: ' + error.message);
    }
}

// === 配置管理 ===
async function getAdminConfig() {
    try {
        console.log('获取系统配置...');
        const issue = await githubApiRequest(
            `/repos/${CONFIG.owner}/${CONFIG.repo}/issues/${CONFIG.CONFIG_ISSUE_NUMBER}`
        );
        
        const configMatch = issue.body.match(/```json\n({[\s\S]*?})\n```/);
        if (configMatch) {
            const config = JSON.parse(configMatch[1]);
            console.log('配置获取成功');
            return config;
        }
        throw new Error('配置格式错误');
    } catch (error) {
        if (error.message.includes('404')) {
            throw new Error('系统未初始化，请先登录管理员账号完成初始化');
        }
        throw error;
    }
}

async function updateConfig(config) {
    const issueBody = `# 🔧 系统配置 - 请勿删除\n\n这是私密对话系统的配置文件。\n\n\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``;

    const token = await getAdminToken();
    await githubApiRequest(`/repos/${CONFIG.owner}/${CONFIG.repo}/issues/${CONFIG.CONFIG_ISSUE_NUMBER}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `token ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            body: issueBody
        })
    });
}

// === 管理员认证 ===
async function verifyAdminCredentials(username, password) {
    console.log('验证管理员凭证:', username);
    
    if (!username || !password) {
        throw new Error('账号和密码不能为空');
    }

    try {
        const config = await getAdminConfig();
        const storedUsername = simpleDecrypt(config.admin.username);
        const storedPassword = simpleDecrypt(config.admin.password);
        
        const isValid = storedUsername === username && storedPassword === password;
        console.log('凭证验证结果:', isValid);
        return isValid;
    } catch (error) {
        if (error.message.includes('未初始化')) {
            console.log('系统未初始化，开始自动初始化...');
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
    await updateConfig(config);
}

// === 密钥管理 ===
async function createNewSecretKey(keyName, secretKey) {
    console.log('创建新密钥:', keyName, secretKey);
    
    const config = await getAdminConfig();
    const token = await getAdminToken();
    
    // 创建对话Issue
    const issueBody = `# 💬 对话: ${keyName}\n\n**密钥:** ${secretKey}\n**创建时间:** ${new Date().toLocaleString('zh-CN')}\n**状态:** 🔵 活跃\n\n---\n\n此对话线程由密钥保护，只有持有正确密钥的用户可以访问。`;
    
    const issue = await githubApiRequest(`/repos/${CONFIG.owner}/${CONFIG.repo}/issues`, {
        method: 'POST',
        headers: {
            'Authorization': `token ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            title: `💬 ${keyName}`,
            body: issueBody,
            labels: ['secret-chat']
        })
    });

    // 更新配置
    config.chats.push({
        id: issue.number,
        name: keyName,
        secretKey: secretKey,
        createdAt: new Date().toISOString(),
        active: true,
        messageCount: 0
    });

    await updateConfig(config);
    console.log('密钥创建成功，Issue编号:', issue.number);
    return issue;
}

async function getAllChats() {
    try {
        const config = await getAdminConfig();
        return config.chats.filter(chat => chat.active !== false);
    } catch (error) {
        console.error('获取对话列表失败:', error);
        return [];
    }
}

async function findChatBySecretKey(secretKey) {
    console.log('查找密钥:', secretKey);
    const chats = await getAllChats();
    const chat = chats.find(chat => chat.secretKey === secretKey);
    console.log('查找结果:', chat ? '找到' : '未找到');
    return chat;
}

// === 消息管理 ===
async function getChatMessages(issueNumber) {
    console.log('获取消息，Issue:', issueNumber);
    try {
        const comments = await githubApiRequest(
            `/repos/${CONFIG.owner}/${CONFIG.repo}/issues/${issueNumber}/comments?per_page=100&sort=created&direction=asc`
        );
        console.log(`获取到 ${comments.length} 条消息`);
        return comments;
    } catch (error) {
        console.error('获取消息失败:', error);
        throw error;
    }
}

async function sendChatMessage(issueNumber, message) {
    console.log('发送消息到Issue:', issueNumber, '内容:', message.substring(0, 50) + '...');
    
    const token = await getAdminToken();
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
    
    console.log('消息发送成功');
}

// === Token 管理 ===
async function getAdminToken() {
    let token = sessionStorage.getItem('githubToken');
    
    if (!token) {
        token = prompt('请输入 GitHub Personal Access Token（需要 repo 权限）:');
        if (!token) {
            throw new Error('需要 GitHub Token 才能执行此操作');
        }
        
        // 验证Token格式
        if (!token.startsWith('ghp_')) {
            throw new Error('Token格式不正确，应以 ghp_ 开头');
        }
        
        sessionStorage.setItem('githubToken', token);
        console.log('Token已保存到sessionStorage');
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
    let escaped = div.innerHTML;
    
    // 保留换行和空格
    escaped = escaped.replace(/\n/g, '<br>');
    escaped = escaped.replace(/  /g, ' &nbsp;');
    
    // 链接检测
    escaped = escaped.replace(
        /(https?:\/\/[^\s<]+)/g, 
        '<a href="$1" target="_blank" rel="noopener" style="color: #2196F3; text-decoration: underline;">$1</a>'
    );
    
    return escaped;
}

// 调试信息
console.log('系统配置:', CONFIG);

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
window.simpleEncrypt = simpleEncrypt;
window.simpleDecrypt = simpleDecrypt;
window.showAlert = showAlert;
