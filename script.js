// === 配置区域 === ！！请检查这些配置是否正确！！
const CONFIG = {
    owner: '159sunsu753', // 您的GitHub用户名
    repo: 'my-message-board', // 您的仓库名
    issue_number: 1, // 您创建的Issue编号
    secretPassword: '此网站9999', // 访问密码（支持中文！）
    autoRefreshInterval: 10000 // 自动刷新时间（毫秒），10秒 = 10000
};
// === 配置结束 ===

// 获取页面元素
const loginScreen = document.getElementById('login-screen');
const messageBoard = document.getElementById('message-board');
const passwordInput = document.getElementById('password-input');
const loginButton = document.getElementById('login-button');
const messageList = document.getElementById('message-list');
const messageInput = document.getElementById('message-input');
const submitButton = document.getElementById('submit-button');
const logoutButton = document.getElementById('logout-button');

// 全局变量
let refreshInterval = null;
let cachedToken = ''; // 缓存Token，避免重复输入

// 1. 登录逻辑
loginButton.addEventListener('click', handleLogin);
passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
});

function handleLogin() {
    const inputPassword = passwordInput.value.trim();
    if (inputPassword === CONFIG.secretPassword) {
        loginScreen.style.display = 'none';
        messageBoard.style.display = 'block';
        passwordInput.value = '';
        initializeMessageBoard();
    } else {
        showAlert('密码错误，请重新输入！', 'error');
        passwordInput.value = '';
        passwordInput.focus();
    }
}

// 退出登录
logoutButton.addEventListener('click', () => {
    // 清除自动刷新
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
    // 清除缓存的Token
    cachedToken = '';
    // 回到登录界面
    messageBoard.style.display = 'none';
    loginScreen.style.display = 'flex';
    messageInput.value = '';
});

// 2. 初始化留言板
function initializeMessageBoard() {
    // 立即加载一次留言
    loadMessages();
    
    // 设置定时自动刷新
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    refreshInterval = setInterval(loadMessages, CONFIG.autoRefreshInterval);
    
    // 焦点放到输入框
    messageInput.focus();
}

// 3. 显示提示信息（比alert更友好）
function showAlert(message, type = 'info') {
    // 移除已有的提示
    const existingAlert = document.querySelector('.custom-alert');
    if (existingAlert) {
        existingAlert.remove();
    }
    
    // 创建新提示
    const alert = document.createElement('div');
    alert.className = `custom-alert ${type}`;
    alert.textContent = message;
    
    // 添加到页面
    document.body.appendChild(alert);
    
    // 3秒后自动消失
    setTimeout(() => {
        if (alert.parentNode) {
            alert.remove();
        }
    }, 3000);
}

// 4. 加载留言的函数（增强版）
async function loadMessages() {
    try {
        const apiUrl = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/issues/${CONFIG.issue_number}/comments`;
        const response = await fetch(apiUrl);

        if (!response.ok) {
            throw new Error(`网络请求失败: ${response.status}`);
        }

        const comments = await response.json();
        
        // 记录当前滚动位置
        const wasAtBottom = isScrolledToBottom();
        
        updateMessageList(comments);
        
        // 如果之前就在底部，或者这是第一次加载，滚动到底部
        if (wasAtBottom || messageList.children.length === comments.length) {
            scrollToBottom();
        }

    } catch (error) {
        console.error('加载留言出错:', error);
        if (messageList.children.length === 0 || 
            (messageList.children.length === 1 && 
             messageList.children[0].textContent.includes('加载中'))) {
            messageList.innerHTML = '<li style="color: #666;">系统： 暂时无法加载留言，请检查网络连接。</li>';
        }
    }
}

// 检查是否滚动到底部
function isScrolledToBottom() {
    const threshold = 100; // 距离底部的阈值
    return messageList.scrollTop + messageList.clientHeight >= messageList.scrollHeight - threshold;
}

// 滚动到底部
function scrollToBottom() {
    messageList.scrollTop = messageList.scrollHeight;
}

// 更新留言列表
function updateMessageList(comments) {
    if (comments.length === 0) {
        messageList.innerHTML = '<li style="color: #666;">系统： 还没有留言，快来发送第一条吧！</li>';
        return;
    }

    // 创建新的留言列表
    let newHTML = '';
    comments.forEach(comment => {
        const date = new Date(comment.created_at).toLocaleString('zh-CN');
        newHTML += `
            <li>
                <strong>${comment.user.login}</strong> 
                <span style="color: #666; font-size: 0.9em;">(${date})</span>:
                <br>
                ${escapeHtml(comment.body)}
            </li>
        `;
    });
    
    // 只有当内容真正改变时才更新DOM，避免不必要的闪烁
    if (messageList.innerHTML !== newHTML) {
        messageList.innerHTML = newHTML;
    }
}

// HTML转义，防止XSS攻击
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 5. 发送留言的函数（增强版）
async function postMessage(messageText) {
    let token = cachedToken;
    
    // 如果没有缓存的Token，就请求用户输入
    if (!token) {
        token = prompt(`请粘贴您的 GitHub Personal Access Token：\n\n(为确保安全，此Token仅在此次会话中缓存，退出登录后清除)`);
        
        if (!token) {
            showAlert('发送失败：需要Token才能发布留言。', 'error');
            return false;
        }
        
        // 验证Token格式
        if (!token.startsWith('ghp_')) {
            showAlert('Token格式似乎不正确，请检查后重试。', 'error');
            return false;
        }
        
        // 缓存Token
        cachedToken = token;
    }

    try {
        const apiUrl = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/issues/${CONFIG.issue_number}/comments`;
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                body: messageText
            })
        });

        if (!response.ok) {
            if (response.status === 401) {
                // Token无效，清除缓存
                cachedToken = '';
                showAlert('Token无效或已过期，请重新输入。', 'error');
            }
            throw new Error(`发送失败: ${response.status} ${response.statusText}`);
        }

        showAlert('留言发送成功！', 'success');
        return true;

    } catch (error) {
        console.error('发送留言出错:', error);
        showAlert('发送失败：' + error.message, 'error');
        return false;
    }
}

// 6. 发送按钮事件
submitButton.addEventListener('click', handleSubmitMessage);

// 按Ctrl+Enter发送
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
        handleSubmitMessage();
    }
});

async function handleSubmitMessage() {
    const text = messageInput.value.trim();
    if (text === '') {
        showAlert('留言内容不能为空！', 'error');
        messageInput.focus();
        return;
    }

    // 禁用按钮，防止重复发送
    submitButton.disabled = true;
    submitButton.textContent = '发送中...';

    const success = await postMessage(text);

    if (success) {
        messageInput.value = ''; // 清空输入框
        // 立即重新加载留言
        loadMessages();
    }

    // 恢复按钮
    submitButton.disabled = false;
    submitButton.textContent = '发送留言';
    messageInput.focus();
}

// 页面加载完成后的初始化
document.addEventListener('DOMContentLoaded', function() {
    passwordInput.focus();
});
