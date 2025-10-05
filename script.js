// === 配置区域 === ！！需要您修改！！
// 请将下面‘YOUR_GITHUB_USERNAME’替换成您自己的GitHub用户名
const CONFIG = {
    owner: '159sunsu753', // 修改这里！
    repo: 'my-message-board',
    issue_number: 1, // 我们下一步会创建，先保留1
    secretPassword: '此网站9999' // 这是访问密码，可以按需修改
};
// === 配置结束 ===

// 获取页面上的元素
const loginScreen = document.getElementById('login-screen');
const messageBoard = document.getElementById('message-board');
const passwordInput = document.getElementById('password-input');
const loginButton = document.getElementById('login-button');
const messageList = document.getElementById('message-list');
const messageInput = document.getElementById('message-input');
const submitButton = document.getElementById('submit-button');
const logoutButton = document.getElementById('logout-button');

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
        loadMessages(); // 登录成功后加载留言
    } else {
        alert('密码错误，请重新输入！');
        passwordInput.value = '';
        passwordInput.focus();
    }
}

// 退出登录
logoutButton.addEventListener('click', () => {
    messageBoard.style.display = 'none';
    loginScreen.style.display = 'flex';
    passwordInput.value = '';
});

// 2. 加载留言的函数
async function loadMessages() {
    messageList.innerHTML = '<li>系统： 正在加载留言...</li>';

    try {
        const apiUrl = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/issues/${CONFIG.issue_number}/comments`;
        const response = await fetch(apiUrl);

        if (!response.ok) {
            throw new Error(`网络请求失败: ${response.status}`);
        }

        const comments = await response.json();
        messageList.innerHTML = ''; // 清空“加载中”

        if (comments.length === 0) {
            messageList.innerHTML = '<li>系统： 还没有留言，快来第一条吧！</li>';
            return;
        }

        // 显示每一条留言
        comments.forEach(comment => {
            const li = document.createElement('li');
            // 格式化时间
            const date = new Date(comment.created_at).toLocaleString('zh-CN');
            li.innerHTML = `
                <strong>${comment.user.login}</strong> 
                <span style="color: #666; font-size: 0.9em;">(${date})</span>:
                <br>
                ${comment.body}
            `;
            messageList.appendChild(li);
        });

        // 滚动到最底部，看最新消息
        messageList.scrollTop = messageList.scrollHeight;

    } catch (error) {
        console.error('加载留言出错:', error);
        messageList.innerHTML = `<li style="color: red;">系统错误：无法加载留言。请检查网络或稍后再试。</li>`;
    }
}

// 3. 发送留言的函数
async function postMessage(messageText) {
    // 弹窗让您输入Token，这是为了安全
    const token = prompt('请粘贴您的 GitHub Personal Access Token：\n(为确保安全，此Token不会保存)');
    
    if (!token) {
        alert('发送失败：需要Token才能发布留言。');
        return false;
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
            throw new Error(`发送失败: ${response.status}`);
        }

        alert('留言发送成功！');
        return true;

    } catch (error) {
        console.error('发送留言出错:', error);
        alert('发送失败：' + error.message + '\n请检查Token是否正确且有权限。');
        return false;
    }
}

// 点击发送按钮
submitButton.addEventListener('click', async () => {
    const text = messageInput.value.trim();
    if (text === '') {
        alert('留言内容不能为空！');
        return;
    }

    // 禁用按钮，防止重复发送
    submitButton.disabled = true;
    submitButton.textContent = '发送中...';

    const success = await postMessage(text);

    if (success) {
        messageInput.value = ''; // 清空输入框
        loadMessages(); // 重新加载留言列表
    }

    // 恢复按钮
    submitButton.disabled = false;
    submitButton.textContent = '发送留言';
});

// 按回车也可以发送（Ctrl+Enter）
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
        submitButton.click();
    }
});
