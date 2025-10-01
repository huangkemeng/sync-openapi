# Sync OpenAPI

一个快速同步后端定义的 OpenAPI 契约到前端的工具，自动生成 TypeScript 接口配置和 Axios 请求函数。

[![npm version](https://img.shields.io/npm/v/sync-openapi.svg)](https://www.npmjs.com/package/sync-openapi)
[![license](https://img.shields.io/npm/l/sync-openapi.svg)](https://github.com/huangkemeng/sync-openapi/blob/main/LICENSE)

## 特性

- 🚀 **快速同步**: 从 OpenAPI/Swagger 规范自动生成前端 API 配置
- 📝 **TypeScript 支持**: 生成完整的 TypeScript 类型定义
- 🔧 **Axios 集成**: 自动生成基于 Axios 的 HTTP 请求函数
- 📁 **模块化组织**: 按 API 标签分组，结构清晰
- 🎯 **智能命名**: 自动转换路径为驼峰命名法
- 📦 **多格式支持**: 支持 JSON、表单数据、文件上传等
- ⚡ **零配置**: 开箱即用，无需复杂配置

## 安装

### 全局安装

```bash
npm install sync-openapi -g
```

### 项目依赖安装

```bash
npm install sync-openapi --save-dev
```

## 快速开始

### 基本用法

```bash
sync-api --url https://api.example.com/swagger.json -o ./src/apis
```

### 强制更新配置

```bash
sync-api --url https://api.example.com/swagger.json -f -o ./src/apis
```

### 生成全局类型定义

```bash
sync-api --url https://api.example.com/swagger.json -t -o ./src/apis
```

## 命令行参数

| 参数 | 说明 | 示例 | 必填 |
|------|------|------|------|
| `--url` | OpenAPI/Swagger JSON 文件的 URL | `--url https://api.example.com/swagger.json` | 是 |
| `-o` | 输出目录 | `-o ./src/apis` | 否，默认 `./src/apis` |
| `-f` | 强制从 URL 下载并覆盖本地配置 | `-f` | 否 |
| `-t` | 生成全局类型定义文件 | `-t` | 否 |

## 使用示例

### 1. 基本同步

```bash
# 从远程 OpenAPI 配置生成 API
sync-api --url https://petstore.swagger.io/v2/swagger.json -o ./src/api
```

### 2. 强制更新

```bash
# 强制下载最新配置并覆盖本地
sync-api --url https://api.example.com/swagger.json -f -o ./src/apis
```

### 3. 完整功能

```bash
# 生成 API 配置和全局类型定义
sync-api --url https://api.example.com/swagger.json -f -t -o ./src/apis
```

## 生成的文件结构

执行命令后，工具会生成以下文件结构：

```
src/apis/
├── ApiAxiosInstance.ts      # Axios 实例配置
├── ApiClient.ts             # 全局 API 客户端
├── ApiTypes.ts              # 全局类型定义（使用 -t 参数时生成）
├── Tag1/                    # 按标签分组的 API
│   ├── GetUserById/
│   │   └── index.http.ts    # 单个 API 的请求函数和类型
│   └── CreateUser/
│       └── index.http.ts
└── Tag2/
    └── ...
```

## 生成的代码示例

### API 请求函数

```typescript
// src/apis/User/getUserById/index.http.ts
import type { AxiosRequestConfig, AxiosResponse } from "axios";
import axios from "../../ApiAxiosInstance";
import qs from "qs";

/**
 * 根据ID获取用户信息
 */
export default function getUserById(
  queryParam: GetUserByIdRequest,
  signal?: AbortSignal,
  config?: AxiosRequestConfig
): Promise<AxiosResponse<User>> {
  return axios.get(`/users/${queryParam.id}`, {
    ...config,
    signal,
    params: queryParam,
    paramsSerializer: function (params) {
      return qs.stringify(params, { indices: false });
    }
  });
}

export interface GetUserByIdRequest {
  id: number;
}

export interface User {
  id: number;
  name: string;
  email: string;
}
```

### 全局 API 客户端

```typescript
// src/apis/ApiClient.ts
import getUserById from "./User/getUserById/index.http"
import createUser from "./User/createUser/index.http"

const ApiClient = {
    User: {
        getUserById: getUserById,
        createUser: createUser,
    },
}

export default ApiClient
```

### 使用示例

```typescript
import ApiClient from './src/apis/ApiClient'

// 调用 API
const response = await ApiClient.User.getUserById({ id: 123 })

// 带取消功能的调用
const controller = new AbortController()
const response = await ApiClient.User.getUserById(
  { id: 123 },
  controller.signal
)
```

## 支持的功能

### HTTP 方法
- ✅ GET
- ✅ POST  
- ✅ PUT
- ✅ DELETE
- ✅ PATCH

### 参数类型
- ✅ 路径参数
- ✅ 查询参数
- ✅ 请求体（JSON）
- ✅ 表单数据（multipart/form-data）
- ✅ 文件上传

### 数据类型
- ✅ 基本类型（string, number, boolean）
- ✅ 对象类型
- ✅ 数组类型
- ✅ 枚举类型
- ✅ 引用类型（$ref）
- ✅ 可为空类型

## 配置说明

### Axios 实例配置

生成的 `ApiAxiosInstance.ts` 文件包含基础的 Axios 配置，你可以根据需要自定义：

```typescript
import axios from 'axios';

const apiAxiosInstance = axios.create({
  baseURL: process.env.API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 添加请求拦截器
apiAxiosInstance.interceptors.request.use(
  config => {
    // 添加认证 token
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

export default apiAxiosInstance;
```

## 最佳实践

### 1. 版本控制
建议将生成的 API 文件添加到 `.gitignore`，在 CI/CD 流程中自动生成：

```gitignore
src/apis/
```

### 2. 自定义配置
在生成后，可以修改 `ApiAxiosInstance.ts` 来添加认证、错误处理等逻辑。

### 3. 类型安全
使用 `-t` 参数生成全局类型定义，获得更好的 TypeScript 支持。

### 4. 自动更新
在 package.json 中添加脚本，方便团队使用：

```json
{
  "scripts": {
    "sync-api": "sync-api --url https://api.example.com/swagger.json -f -o ./src/apis",
    "dev": "npm run sync-api && npm run start"
  }
}
```

## 故障排除

### 常见问题

**Q: 执行命令时报错 "请先传入swagger配置的url地址！"**
A: 确保正确使用了 `--url` 参数，并且 URL 地址有效。

**Q: 生成的类型定义不完整**
A: 确保 OpenAPI 规范是 3.x 版本，并使用 `-t` 参数生成全局类型。

**Q: 网络请求失败**
A: 检查网络连接和 URL 可访问性，确保没有防火墙或代理限制。

**Q: 生成的代码有 TypeScript 错误**
A: 生成的代码包含 `// @ts-nocheck` 指令，如需严格类型检查可移除该指令。

## 开发

### 构建项目

```bash
# 安装依赖
npm install

# 构建 TypeScript
npm run build
```

### 测试

```bash
# 运行测试
npm test
```

## 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 许可证

本项目采用 ISC 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 作者

**huangkemeng**

- GitHub: [@huangkemeng](https://github.com/huangkemeng)

## 致谢

感谢以下开源项目：
- [Axios](https://github.com/axios/axios) - Promise based HTTP client
- [OpenAPI Specification](https://github.com/OAI/OpenAPI-Specification) - The OpenAPI Specification
- [Chalk](https://github.com/chalk/chalk) - Terminal string styling

---

**注意**: 本工具专为 OpenAPI 3.x 规范设计，使用其他版本可能无法保证生成的 API 配置完全正确。
