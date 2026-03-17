# OpenClaw 配置设置指南

## 问题诊断

错误显示 `plugins.entries.wildfire.config` 无效，说明配置格式有问题。

## 检查配置位置

OpenClaw 可能使用以下位置之一：

```bash
# 检查这些位置
cat ~/.openclaw/config.yaml
cat ~/.config/openclaw/config.yaml
cat ~/.claw/config.yaml
```

## 正确的配置格式

### 完整配置文件示例

```yaml
# ~/.openclaw/config.yaml

# 其他配置...
# ...

plugins:
  wildfire:
    enabled: true
    gatewayUrl: "ws://localhost:8884/robot/gateway"
    robotId: "FireRobot"
    robotSecret: "123456"
    requireMention: true
    helpKeywords: "帮,请,分析,总结"
```

### 关键注意事项

1. **缩进必须使用空格**（不能用 Tab）
2. **字符串建议加引号**（避免特殊字符问题）
3. **plugins 必须在根级别**，不能嵌套在其他配置下

## 验证配置步骤

### 步骤 1：找到配置文件

```bash
# 方法 1：通过 openclaw 命令
openclaw config path

# 方法 2：手动查找
ls -la ~/.openclaw/config.yaml
ls -la ~/.config/openclaw/config.yaml
```

### 步骤 2：编辑配置

```bash
# 使用你喜欢的编辑器
nano ~/.openclaw/config.yaml
# 或
vim ~/.openclaw/config.yaml
# 或
code ~/.openclaw/config.yaml
```

### 步骤 3：确保 YAML 格式正确

**错误示例**（缩进错误）：
```yaml
plugins:
  wildfire:
    enabled: true
      gatewayUrl: "..."  # 缩进过多！
```

**正确示例**：
```yaml
plugins:
  wildfire:
    enabled: true
    gatewayUrl: "..."
    robotId: "..."
    robotSecret: "..."
```

### 步骤 4：验证 YAML 语法

```bash
# 使用 Python 验证
python3 -c "import yaml; yaml.safe_load(open('~/.openclaw/config.yaml'))"

# 或使用 yq（如果安装了）
yq ~/.openclaw/config.yaml
```

### 步骤 5：重启 OpenClaw

```bash
openclaw restart
```

## 常见错误

### 错误 1：配置在错误的位置

```yaml
# 错误 - 嵌套在 server 下
server:
  plugins:  # 这里错了！
    wildfire:
      gatewayUrl: "..."

# 正确 - 在根级别
server:
  # ...

plugins:
  wildfire:
    gatewayUrl: "..."
```

### 错误 2：使用 Tab 缩进

```yaml
plugins:
	wildfire:  # 使用了 Tab！错误！
		enabled: true

# 必须用空格
plugins:
  wildfire:
    enabled: true
```

### 错误 3：缺少 plugins 父级

```yaml
# 错误
wildfire:
  gatewayUrl: "..."

# 正确
plugins:
  wildfire:
    gatewayUrl: "..."
```

## 调试方法

### 查看完整配置

```bash
# 显示完整配置
openclaw config show

# 获取特定路径
openclaw config get plugins
openclaw config get plugins.wildfire
```

### 手动设置配置

```bash
# 设置单个值
openclaw config set plugins.wildfire.enabled true
openclaw config set plugins.wildfire.gatewayUrl "ws://localhost:8884/robot/gateway"
openclaw config set plugins.wildfire.robotId "FireRobot"
openclaw config set plugins.wildfire.robotSecret "123456"

# 验证
openclaw config get plugins.wildfire.gatewayUrl
```

## 最小工作配置

```yaml
plugins:
  wildfire:
    gatewayUrl: "ws://localhost:8884/robot/gateway"
    robotId: "FireRobot"
    robotSecret: "123456"
```

## 如果还报错

1. **删除配置重新创建**：
```bash
rm ~/.openclaw/config.yaml
openclaw config init
# 然后编辑添加 wildfire 配置
```

2. **检查是否有其他配置文件冲突**：
```bash
find ~ -name "config.yaml" -path "*openclaw*" 2>/dev/null
```

3. **查看 OpenClaw 日志**：
```bash
openclaw logs
```

## 联系支持

如果还是无法解决，请提供：
1. 完整的配置文件内容（脱敏后）
2. OpenClaw 版本
3. 完整的错误日志
