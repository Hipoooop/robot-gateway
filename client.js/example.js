/**
 * 机器人网关客户端 SDK 使用示例
 * 
 * 运行前请确保：
 * 1. 网关服务已启动 (ws://localhost:8884)
 * 2. 已创建机器人并配置回调地址
 * 3. 依赖已安装: npm install
 */

import { 
    RobotServiceClient, 
    Conversation, 
    ConversationType,
    MessageContentType,
    init 
} from './src/index.js';

// ==================== 配置 ====================
const GATEWAY_URL = 'ws://localhost:8884/robot/gateway';
const ROBOT_ID = 'FireRobot';
const ROBOT_SECRET = '123456';

// 初始化 server-sdk（用于创建模型对象，实际请求走网关）
// 这里只需要初始化模型，不需要真实的 admin-secret
init('http://localhost:18080', 'dummy');

// ==================== 消息处理器 ====================
const messageHandler = {
    onMessage: (pushMessage) => {
        console.log('\n📩 收到消息:');
        console.log('  类型:', pushMessage.type);
        console.log('  数据:', JSON.stringify(pushMessage.data, null, 2));
        
        // 自动回复示例
        handleIncomingMessage(pushMessage.data);
    },
    
    onConnectionChanged: (connected) => {
        console.log(connected ? '\n✅ 已连接到网关' : '\n❌ 与网关断开连接');
    },
    
    onError: (error) => {
        console.error('\n💥 错误:', error);
    }
};

// ==================== 创建客户端 ====================
const client = new RobotServiceClient(
    GATEWAY_URL,
    messageHandler,
    {
        timeout: 30,
        reconnectInterval: 5000,
        heartbeatInterval: 270000
    }
);

// ==================== 消息处理逻辑 ====================
async function handleIncomingMessage(data) {
    const { sender, conv, payload } = data;
    
    // 只处理文本消息
    if (payload.type === MessageContentType.Text) {
        const content = payload.searchableContent || payload.content;
        console.log(`  内容: ${content}`);
        
        // 简单回复
        const replyPayload = {
            type: MessageContentType.Text,
            searchableContent: `收到你的消息: "${content}"`
        };
        
        try {
            const result = await client.sendMessage(ROBOT_ID, conv, replyPayload);
            if (result.isSuccess()) {
                console.log('  ✅ 自动回复成功');
            } else {
                console.log('  ❌ 自动回复失败:', result.getMsg());
            }
        } catch (error) {
            console.error('  ❌ 自动回复错误:', error.message);
        }
    }
}

// ==================== 命令处理 ====================
async function processCommand(command, args) {
    switch (command) {
        case 'send': {
            // send <userId> <message>
            if (args.length < 2) {
                console.log('用法: send <userId> <message>');
                return;
            }
            const [userId, ...messageParts] = args;
            const message = messageParts.join(' ');
            
            const conversation = new Conversation(ConversationType.Single, userId, 0);
            const payload = {
                type: MessageContentType.Text,
                searchableContent: message
            };
            
            const result = await client.sendMessage(ROBOT_ID, conversation, payload);
            if (result.isSuccess()) {
                console.log(`✅ 消息已发送给 ${userId}`);
            } else {
                console.log('❌ 发送失败:', result.getMsg());
            }
            break;
        }
        
        case 'info': {
            // info <userId>
            if (args.length < 1) {
                console.log('用法: info <userId>');
                return;
            }
            const userId = args[0];
            const result = await client.getUserInfo(userId);
            
            if (result.isSuccess()) {
                console.log('用户信息:', JSON.stringify(result.getResult(), null, 2));
            } else {
                console.log('获取失败:', result.getMsg());
            }
            break;
        }
        
        case 'profile': {
            const result = await client.getProfile();
            if (result.isSuccess()) {
                console.log('机器人资料:', JSON.stringify(result.getResult(), null, 2));
            } else {
                console.log('获取失败:', result.getMsg());
            }
            break;
        }
        
        case 'group': {
            // group <groupName> <member1> [member2] ...
            if (args.length < 2) {
                console.log('用法: group <groupName> <member1> [member2] ...');
                return;
            }
            const [groupName, ...members] = args;
            
            const groupInfo = {
                name: groupName,
                type: 2 // 普通群组
            };
            
            const memberList = members.map(userId => ({
                memberId: userId,
                alias: ''
            }));
            
            const result = await client.createGroup(groupInfo, memberList);
            if (result.isSuccess()) {
                console.log('✅ 群组创建成功:', result.getResult());
            } else {
                console.log('❌ 创建失败:', result.getMsg());
            }
            break;
        }
        
        case 'status': {
            console.log('连接状态:', client.isConnected() ? '已连接' : '未连接');
            console.log('鉴权状态:', client.isAuthenticated() ? '已鉴权' : '未鉴权');
            break;
        }
        
        case 'help': {
            console.log('\n可用命令:');
            console.log('  send <userId> <message>   - 发送消息');
            console.log('  info <userId>             - 获取用户信息');
            console.log('  group <name> <members...> - 创建群组');
            console.log('  profile                   - 获取机器人资料');
            console.log('  status                    - 查看连接状态');
            console.log('  help                      - 显示帮助');
            console.log('  quit                      - 退出程序');
            break;
        }
        
        case 'quit':
        case 'exit': {
            console.log('正在退出...');
            client.close();
            process.exit(0);
        }
        
        default:
            console.log(`未知命令: ${command}，输入 help 查看帮助`);
    }
}

// ==================== 主程序 ====================
async function main() {
    console.log('🤖 野火IM机器人客户端示例');
    console.log('========================');
    console.log(`网关地址: ${GATEWAY_URL}`);
    console.log(`机器人ID: ${ROBOT_ID}`);
    console.log('');
    
    // 连接
    console.log('正在连接...');
    const connected = await client.connect(ROBOT_ID, ROBOT_SECRET);
    
    if (!connected) {
        console.error('❌ 连接失败，请检查配置');
        process.exit(1);
    }
    
    console.log('✅ 连接成功！');
    console.log('输入 help 查看可用命令\n');
    
    // 读取命令行输入
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', async (data) => {
        const line = data.trim();
        if (!line) return;
        
        const parts = line.split(' ');
        const command = parts[0];
        const args = parts.slice(1);
        
        try {
            await processCommand(command, args);
        } catch (error) {
            console.error('命令执行错误:', error.message);
        }
        
        process.stdout.write('> ');
    });
    
    process.stdout.write('> ');
}

// 处理退出
process.on('SIGINT', () => {
    console.log('\n正在关闭连接...');
    client.close();
    process.exit(0);
});

// 启动
main().catch(error => {
    console.error('程序错误:', error);
    process.exit(1);
});
