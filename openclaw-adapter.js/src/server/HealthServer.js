import http from 'http';

/**
 * 健康检查 HTTP 服务器
 * 提供状态查询接口
 */
export class HealthServer {
    constructor(port, bridge) {
        this.port = port;
        this.bridge = bridge;
        this.server = null;
    }

    /**
     * 启动服务器
     */
    start() {
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                this.handleRequest(req, res);
            });

            this.server.listen(this.port, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log(`Health server started on port ${this.port}`);
                    resolve();
                }
            });

            this.server.on('error', (err) => {
                console.error('Health server error:', err.message);
            });
        });
    }

    /**
     * 处理请求
     */
    handleRequest(req, res) {
        // 设置 CORS 头
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');

        const url = req.url;

        if (url === '/health' || url === '/actuator/health') {
            // 健康检查接口
            this.handleHealthCheck(res);
        } else if (url === '/status' || url === '/openclaw/status') {
            // 详细状态接口
            this.handleStatus(res);
        } else if (url === '/test' || url === '/openclaw/test') {
            // 测试接口
            this.handleTest(res);
        } else {
            // 404
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'Not found' }));
        }
    }

    /**
     * 处理健康检查
     */
    handleHealthCheck(res) {
        const status = this.bridge.getStatus();
        
        const health = {
            status: status.bridge === 'RUNNING' ? 'UP' : 'DOWN',
            components: {
                wildfire: {
                    status: status.wildfire.status,
                    details: {
                        connected: status.wildfire.connected
                    }
                },
                openclaw: {
                    status: status.openclaw.status,
                    details: {
                        connected: status.openclaw.connected
                    }
                }
            }
        };

        res.statusCode = status.bridge === 'RUNNING' ? 200 : 503;
        res.end(JSON.stringify(health, null, 2));
    }

    /**
     * 处理状态查询
     */
    handleStatus(res) {
        const status = this.bridge.getStatus();
        res.statusCode = 200;
        res.end(JSON.stringify(status, null, 2));
    }

    /**
     * 处理测试请求
     */
    handleTest(res) {
        const status = this.bridge.getStatus();
        
        const response = {
            message: 'Openclaw Adapter is running',
            timestamp: new Date().toISOString(),
            wildfire: status.wildfire.connected ? 'Connected' : 'Disconnected',
            openclaw: status.openclaw.connected ? 'Connected' : 'Disconnected',
            bridge: status.bridge
        };

        res.statusCode = 200;
        res.end(JSON.stringify(response, null, 2));
    }

    /**
     * 停止服务器
     */
    stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    console.log('Health server stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}
