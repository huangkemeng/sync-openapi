# 通过OpenApi配置生成Axios接口请求配置（TS）
## 用法
### 安装  
```cmd
npm install sync-openapi -g
```  
### 命令 sync-api，如
```cmd
sync-api --url (https|http)://xxxx/swagger.json -f -o ./src/apis
```  
### 常用参数
#### --url ： 必传，用法：--url https://xxxx/swagger.json 。如果当前工作目录下没有swagger.json的文件，会从指定的链接下载并保存为swagger.json，如果本地已经有了该文件，并且无需从网络上下载更新的话，可以随意指定一个

#### -o ： 非必传，用法：-o  [目录] ，指定生成的接口文件输出的地方 可以用相对目录或绝对目录（./apis 或 d:/apis）, 不指定则默认为 ./src/apis

#### -f : 非必传，用法：-f ,当有该参数时，会从指定的url下载json文件并覆盖本地的swagger.json文件，用于更新接口
