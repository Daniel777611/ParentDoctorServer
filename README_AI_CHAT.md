# AI聊天功能说明

## 功能概述

AI聊天功能已经集成到ParentDoctor应用中，支持：
1. **智能对话**：与家长进行自然语言对话
2. **信息提取**：自动从对话中提取孩子信息（姓名、生日、性别等）
3. **自动保存**：将提取的信息自动保存到数据库
4. **健康建议**：根据孩子信息提供个性化的健康建议

## 配置

### OpenAI API（可选）

如果要使用ChatGPT，需要在 `.env` 文件中添加：

```env
OPENAI_API_KEY=your_openai_api_key_here
```

**注意**：如果没有配置OpenAI API密钥，系统会自动使用基于规则的回复系统，仍然可以正常工作。

### 基于规则的回复系统

当没有OpenAI API密钥时，系统会：
1. 询问用户孩子的姓名、生日、性别
2. 根据关键词提供基本的健康建议
3. 仍然能够提取和保存孩子信息

## API端点

### 发送聊天消息
```
POST /api/parent/chat
Body: {
  "familyId": "fam_xxx",
  "message": "我的孩子好像在发烧"
}
Response: {
  "success": true,
  "response": "AI回复内容",
  "extractedInfo": {
    "childName": "小明",
    "dateOfBirth": "2020-01-01",
    "gender": "male"
  }
}
```

### 清除对话历史
```
POST /api/parent/chat/clear
Body: {
  "familyId": "fam_xxx"
}
```

## 工作流程

1. **用户发送消息** → iOS应用调用 `/api/parent/chat`
2. **服务器处理**：
   - 获取对话历史
   - 检查数据库中已有的孩子信息
   - 调用AI（OpenAI或规则系统）生成回复
   - 从对话中提取孩子信息
   - 如果有新信息，自动保存到数据库
3. **返回回复** → iOS应用显示AI回复

## 信息提取

系统会自动从对话中提取：
- **孩子姓名**：识别 "我的孩子叫X"、"X是我的孩子" 等模式
- **生日/年龄**：识别 "X岁"、"出生于X" 等模式
- **性别**：识别 "男孩"、"女孩"、"儿子"、"女儿" 等关键词

## 数据库保存

提取的信息会自动保存到 `child` 表：
- `family_id`: 家庭ID
- `child_name`: 孩子姓名
- `date_of_birth`: 生日
- `gender`: 性别
- `extracted_from_chat`: 标记为从聊天中提取

## 测试

1. 登录应用
2. 在AI聊天框中发送消息
3. AI会询问孩子信息
4. 回答后，信息会自动保存
5. 后续对话会使用已保存的信息提供个性化建议

