#!/usr/bin/env node
const fs = require("fs");
let https = require("https");
const chalk = require("chalk");
const {resolve} = require("path");
const {log} = require("console");
const args = process.argv;
let swagger = {};
const pathAndInterfaces = [];
let fileUrl = '';
let output = './src/apis';
main();

async function main() {
    // 用于测试的代码
    const useTestSwagger = args.indexOf("--test") !== -1;
    if (!useTestSwagger) {
        var urlIndex = args.indexOf('--url');
        if (urlIndex === -1) {
            return console.log(chalk.red('请先传入swagger配置的url地址！'));
        } else {
            fileUrl = args[urlIndex + 1];
            if (!fileUrl) {
                return console.log(chalk.red('请先传入swagger配置的url地址！'));
            }
            if (fileUrl.indexOf('http://') !== -1) {
                https = require('http');
            } else {
                process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
            }
        }
    }
    var outputCmdIndex = args.indexOf('-o');
    if (outputCmdIndex !== -1 && args[outputCmdIndex + 1]) {
        output = args[outputCmdIndex + 1];
    }
    if (useTestSwagger) {
        console.log(chalk.blue('使用测试swagger配置！'));
        fs.copyFileSync(resolve('./test-swagger.json'), resolve('./swagger.json'));
    }
    
    const existSwagger = fs.existsSync(resolve('./swagger.json'));
    var hasF = args.indexOf("-f") !== -1;
    if (!useTestSwagger && (!existSwagger || hasF)) {
        console.log(chalk.blue(`正在从[${fileUrl}]获取新的swagger配置！`));
        var downResult = await getSwaggerFile();
        if (!downResult) {
            return console.log(chalk.red('swagger配置请求失败,请检查网络或url是否设置正确！'));
        }
    } else if(!useTestSwagger) {
        console.log(chalk.blue('使用已存在的swagger配置！'));
    }
    const jsonString = fs.readFileSync(resolve("./swagger.json"));
    swagger = JSON.parse(jsonString);
    if ((!swagger.openapi && !swagger.swagger) || (swagger.openapi || swagger.swagger).split('.')[0] !== '3') {
        console.log(chalk.red('当前openapi版本不是3.x.x版本，无法保证生成的api配置全部正确，请酌情使用。'));
    } else {
        console.log(chalk.green(`当前openapi版本:${(swagger.openapi || swagger.swagger)},适用当前版本！`));
    }
    createActionDirs();
    return process.exit();
}

function pathConvertToUpperCamelCaseActionName(path, method) {
    var operationId = swagger['paths'][path][method]['operationId'];
    if (operationId) {
        return operationId;
    }
    var paths = path.split("/");
    var name = "";
    paths.forEach(p => {
        var pathParam = /(?<=\{)(\w+)(?=\})/.exec(p);
        if (pathParam && pathParam.length) {
            name +=
                "By" +
                pathParam[0].replace(/^([a-zA-Z])(\w+)/, (original, $1, $2) => {
                    if ($1 && $2) {
                        return $1.toUpperCase() + $2;
                    }
                    return original;
                });
        } else if (p !== "api") {
            name += p.replace(/^([a-zA-Z])(\w+)/, (original, $1, $2) => {
                if ($1 && $2) {
                    return $1.toUpperCase() + $2;
                }
                return original;
            });
        }
    });
    return name.replace(/\W/g, '_');
}

function createActionDirs() {
    var actions = [];
    for (const path in swagger.paths) {
        var methods = getHttpMethods(path);
        methods.forEach(method => {
            var methodUpper = method.replace(/^([a-zA-Z])(\w+)/, (original, $1, $2) => {
                if ($1 && $2) {
                    return $1.toUpperCase() + $2;
                }
                return original;
            });
            let action = pathConvertToUpperCamelCaseActionName(path, method) + (methods.length > 1 ? 'Via' + methodUpper : '');
            if (actions.indexOf(action) != -1) {
                if (/(\w+)(\d)$/.test(action)) {
                    action = action.replace(/(\w+)(\d)$/, function (_, $1, $2) {
                        return $1 + (parseInt($2) + 1);
                    });
                } else {
                    action = action + "_1";
                }
            }
            var summary = swagger.paths[path][method]['summary'] || ''
            actions.push({path, action, method, summary});
        })
    }
    let totalNew = 0;
    var absPath = resolve(output);
    if (output.indexOf(':') !== -1) {
        var pathPartMatchs = absPath.match(/([^\\\/:]+)/g);
        if (pathPartMatchs.length) {
            var dir = pathPartMatchs.shift();
            pathPartMatchs.reduce((pre, current) => {
                var pathPart = pre + '/' + current
                if (!fs.existsSync(resolve(pathPart))) {
                    fs.mkdirSync(resolve(pathPart));
                }
                return pathPart;
            }, dir + ':');
        }
    } else {
        var relaPath = absPath.substring(resolve('./').length);
        var relaPathPartMatchs = relaPath.match(/([^\\\/]+)/g);
        if (relaPathPartMatchs && relaPathPartMatchs.length) {
            relaPathPartMatchs.reduce((pre, current) => {
                var relaPathPart = pre + '/' + current
                if (!fs.existsSync(resolve(relaPathPart))) {
                    fs.mkdirSync(resolve(relaPathPart));
                }
                return relaPathPart;
            }, '.');
        }
    }
    var tagAndTypes = []
    var tagAndApis = []
    actions.forEach((item) => {
        var tagAndType = {name: 'unGrouped', value: []}
        var tagAndApi = {name: 'unGrouped', value: []}
        var tags = getTagsByPath(item.path, item.method);
        var actionPath = `${output}/${item.action}`;
        if (tags && tags.length) {
            var tag = tags[0];
            tagAndType.name = tag;
            tagAndApi.name = tag;
            actionPath = `${output}/${tag}/${item.action}`;
            if (!fs.existsSync(resolve(output + '/' + tag))) {
                fs.mkdirSync(resolve(output + '/' + tag));
            }
        }
        if (!fs.existsSync(resolve(actionPath))) {
            fs.mkdirSync(resolve(actionPath));
        }
        var summary = ''
        if (item.summary.replaceAll(' ', '')) {
            summary = `    /**\n     * ${item.summary}\n     */\n`
        }
        var requestBodyContent = buildRequestBodyInterface(item);
        var parameterContent = buildParametersInterface(item);
        var responseContent = buildResponseInterface(item);
        var paramTypeName = '';
        if (requestBodyContent.def) {
            paramTypeName = requestBodyContent.def;
            if (parameterContent.def) {
                paramTypeName += ` & ${parameterContent.def}`;
            }
        } else {
            paramTypeName = parameterContent.def;
        }
        var indexFileContent = buildIndexFileContent(item, paramTypeName, responseContent.def);
        indexFileContent += '\n\n' + (requestBodyContent.model || '') + (parameterContent.model || '') + (responseContent.model || '');
        fs.writeFileSync(resolve(actionPath + '/index.http.ts'), indexFileContent);
        // fs.writeFileSync(resolve(actionPath + '/type.d.ts'), `declare global {\n  interface HttpApi {\n${summary}    ${item.action}: typeof import("./index.http").default;\n  }\n}\nexport { };`);
        console.log(chalk.yellow(`生成或更新了接口配置[${actionPath}]`));
        tagAndApi.value.push({apiName: item.action, def: item.action, path: `${item.action}/index.http`})
        totalNew++;
        if (requestBodyContent.def) {
            let pureDef = requestBodyContent.def.replaceAll('[]', '');
            if (pureDef && !isBaseType(pureDef)) {
                tagAndType.value.push({def: pureDef, typeName: pureDef, path: `${item.action}/index.http.ts`});
            }
        }
        if (parameterContent.def) {
            let pureDef = parameterContent.def.replaceAll('[]', '');
            if (pureDef && !isBaseType(pureDef)) {
                tagAndType.value.push({def: pureDef, typeName: pureDef, path: `${item.action}/index.http.ts`});
            }
        }
        if (responseContent.def) {
            let pureDef = responseContent.def.replaceAll('[]', '');
            if (pureDef && !isBaseType(pureDef)) {
                tagAndType.value.push({def: pureDef, typeName: pureDef, path: `${item.action}/index.http.ts`});
            }
        }
        if (tagAndType.value.length) {
            var addedTagAndType = tagAndTypes.find(e => tagAndType.name === e.name);
            if (addedTagAndType) {
                tagAndType.value.forEach(x => {
                    let existed = addedTagAndType.value.find(e => x.typeName === e.typeName);
                    if (existed) {
                        addedTagAndType.value.push({def: x.def, typeName: `${item.action}_${x.typeName}`, path: x.path})
                    } else {
                        addedTagAndType.value.push(x);
                    }
                })
            } else {
                tagAndTypes.push(tagAndType);
            }
        }

        if (tagAndApi.value.length) {
            var addedTagAndApi = tagAndApis.find(e => tagAndApi.name === e.name);
            if (addedTagAndApi) {
                tagAndApi.value.forEach(x => {
                    let existedApi = addedTagAndApi.value.find(e => x.apiName === e.apiName);
                    if (existedApi) {
                        addedTagAndApi.value.push({def: x.def, apiName: `${item.action}_${x.name}`, path: x.path})
                    } else {
                        addedTagAndApi.value.push(x);
                    }
                })
            } else {
                tagAndApis.push(tagAndApi);
            }
        }
    });
    var apiTClientDeclare = generateGlobalApiClientDeclare(tagAndApis);
    if (apiTClientDeclare) {
        fs.writeFileSync(resolve(output + '/ApiClient.ts'), apiTClientDeclare);
    }
    var hasT = args.indexOf("-t") !== -1;
    if (hasT) {
        var globalApiTypeDeclare = generateGlobalApiTypeDeclare(tagAndTypes);
        if (globalApiTypeDeclare) {
            fs.writeFileSync(resolve(output + '/ApiTypes.ts'), globalApiTypeDeclare);
        }
    }
    console.log(chalk.green(`共生成或更新了${totalNew}个接口的配置！`));
}

function isBaseType(type) {
    return ['integer', 'number', 'boolean', 'string', 'BinaryData', 'FormData', 'object', 'array', '[]'].indexOf(type) !== -1;
}

function generateGlobalApiClientDeclare(tagAndApis) {
    if (tagAndApis && tagAndApis.length) {
        var declareImport = '';
        var declareApi = `const ApiClient = {\n`
        tagAndApis.forEach(tag => {
            if (tag.name === 'unGrouped') {
                tag.value.forEach(type => {
                    declareImport += `import ${type.apiName} from "./${type.path}"\n`
                    declareApi += `    ${type.apiName}: ${type.apiName},\n`
                })
            } else {
                declareApi += `    ${tag.name}: {\n`;
                tag.value.forEach(type => {
                    declareImport += `import ${type.apiName} from "./${tag.name}/${type.path}"\n`
                    declareApi += `        ${type.apiName}: ${type.apiName},\n`
                })
                declareApi += '    },\n'
            }
        })
        declareApi += "}\n"
        declareApi += "export default ApiClient"
        return `${declareImport}\n${declareApi}`;
    }
}

function generateGlobalApiTypeDeclare(tagAndTypes) {
    if (tagAndTypes && tagAndTypes.length) {
        var declareString = `type ApiTypes = {\n`
        tagAndTypes.forEach(tag => {
            if (tag.name === 'unGrouped') {
                tag.value.forEach(type => {
                    declareString += `    ${type.typeName}: import("./${type.path}").${type.def};\n`
                })
            } else {
                declareString += `    ${tag.name}: {\n`;
                tag.value.forEach(type => {
                    declareString += `        ${type.typeName}: import("./${tag.name}/${type.path}").${type.def};\n`
                })
                declareString += '    }\n'
            }
        })
        declareString += "}\n"
        declareString += "export default ApiTypes"
        return declareString;
    }
}

function getTagsByPath(path, methodName) {
    var config = swagger["paths"][path][methodName];
    return config["tags"];
}

function buildIndexFileContent(item, paramName, responseName) {
    var paramDef = '';
    var paramRef = ''
    var url = '`' + item.path.replace(/\{(\w+)\}/g, '${request.$1}') + '`';
    var includeQs = '';
    if (paramName) {
        if (item.method == 'post' || item.method == 'put' || item.method == 'patch') {
            paramDef = `\n  data: ${paramName},\n`;
            paramRef = ', data, { ...config, signal: signal }';
            url = '`' + item.path.replace(/\{(\w+)\}/g, '${data.$1}') + '`';
        } else {
            paramDef = `\n  request: ${paramName},\n`;
            paramRef = ', {\n    ...config,\n    params: request,\n    paramsSerializer: function (params) {\n      return qs.stringify(params, { indices: false });\n    },\n    signal: signal\n  }';
            includeQs = '\nimport qs from "qs";'
        }
    } else {
        if (item.method == 'post' || item.method == 'put' || item.method == 'patch') {
            paramRef = ', null, { ...config, signal: signal }';
        } else {
            paramRef = ', { ...config, signal: signal }';
        }
    }
    var summary = ''
    if (item.summary.replaceAll(' ', '')) {
        summary = `/**\n * ${item.summary}\n */\n`
    }
    var responseDef = `<AxiosResponse<${responseName || 'any'}>>`
    return `import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";${includeQs}\n\n${summary}export default function ${item.action}(${paramDef}  signal?: AbortSignal,\n  config?: AxiosRequestConfig): Promise${responseDef} {\n  return axios.${item.method}(${url}${paramRef});\n}`
}

function buildResponseInterface(item) {
    var responses = swagger['paths'][item.path][item.method]['responses'];
    var listDefs = [];
    var model = '';
    if (responses) {
        for (var response in responses) {
            if (responses[response].content) {
                var schema = getRequestBodySchema(responses[response]);
                if (schema) {
                    var shape = handleSchema(schema, item)
                    listDefs.push(shape.def);
                    model += shape.model;
                }
            }
        }
    }
    return {
        def: listDefs.join(' | '),
        model
    };
}

function buildRequestBodyInterface(item) {
    var requestBody = swagger['paths'][item.path][item.method]['requestBody'];
    if (!requestBody) {
        return '';
    }
    var schema = getRequestBodySchema(requestBody);
    var shape = handleSchema(schema, item)
    return shape;
}

function buildParametersInterface(item) {
    var shape = {def: '', model: ''};
    var parameters = swagger['paths'][item.path][item.method]['parameters'];
    if (parameters) {
        var model = `export interface ${item.action}Request {\n`;
        var childModel = '';
        parameters.forEach(parameter => {
            var nullable = !parameter.required ? ' | undefined' : ''
            if (parameter.required !== undefined) {
                model += `  /**\n   * required: ${parameter.required}\n   */\n`
            }
            if (parameter.description) {
                model += `  /**\n   * ${parameter.description}\n   */\n`
            }
            if (parameter.schema) {
                var parameterShape = handleSchema(parameter.schema, item);
                if (/[^a-zA-Z0-9]/.test(parameter.name)) {
                    parameter.name = `"${parameter.name}"`
                }
                model += '  ' + parameter.name + ': ' + parameterShape.def + nullable + ';\n';
                childModel += parameterShape.model;
            } else {
                var parameterShape = handleSchema(parameter, item)
                model += parameterShape.def;
                childModel += parameterShape.model;
            }
        })
        model += `}\n\n`;
        shape.model = model;
        shape.model += childModel;
        shape.def = item.action + 'Request';
    }
    return shape;
}

function handleSchema(schema, item) {
    var shape = {
        def: '',
        schema: schema,
        model: ''
    }
    if (!schema) {
        return shape;
    }
    if (schema.name && /[^a-zA-Z0-9]/.test(schema.name)) {
        schema.name = `"${schema.name}"`
    }
    var nullable = schema.nullable ? ' | undefined' : '';
    if (schema.type == 'integer' || schema.type == 'number') {
        if (schema.name) {
            shape.def = '  ' + schema.name + ` : number${nullable};\n`
        } else if (schema.prop && schema.enum) {
            shape.def = schema.prop;
            if (schema.description) {
                shape.model += `  /**\n   * ${schema.description}\n   */\n`
            }
            shape.model += `export enum ${schema.prop} {\n${schema.enum.map(e => '  ' + (schema.prop + '_' + e).replace(/\W/g, '_') + ' = ' + e).join(',\n')}\n}\n\n`
        } else {
            shape.def = 'number';
        }
    } else if (schema.type == 'boolean') {
        if (schema.name) {
            shape.def = '  ' + schema.name + ` : boolean${nullable};\n`
        } else {
            shape.def = 'boolean';
        }
    } else if (schema.type == 'string') {
        if (schema.name) {
            shape.def = '  ' + schema.name + ` : string${nullable};\n`
        } else {
            if (schema.format === 'binary') {
                shape.def = 'BinaryData';
            } else {
                shape.def = 'string';
            }
        }
    } else if (schema.type == 'object') {
        if (schema.name) {
            shape.def = '  ' + schema.name + ` : object${nullable};\n`
        } else if (schema.prop) {
            shape.def = schema.prop;
            var model = `export interface ${schema.prop} {\n`;
            var childModel = '';
            if (schema.properties && (Object.keys(schema.properties).length || schema.properties.length)) {
                for (var prop in schema.properties) {
                    var propSchema = schema.properties[prop];
                    // 处理包含点号的属性名
                    var formattedProp = prop;
                    if (/[^a-zA-Z0-9]/.test(prop)) {
                        formattedProp = `"${prop}"`;
                    }
                    propSchema.prop = formattedProp;
                    var propShape = handleSchema(propSchema, item);
                    var comment = ''
                    if (propSchema.description) {
                        comment += `   * ${propSchema.description}\n`
                    }
                    if (propSchema.format) {
                        comment += `   * format: ${propSchema.format}\n`
                    }
                    if (comment) {
                        model += `  /**\n${comment}   */\n`
                    }
                    var canNull = propSchema.nullable ? ' | undefined' : '';
                    model += '  ' + formattedProp + ': ' + propShape.def + canNull + ';\n';
                    childModel += propShape.model;
                }
            }
            model += '}\n\n'
            shape.model = model;
            shape.model += childModel;
        } else if (schema.properties) {
            // 检查是否是multipart/form-data类型的请求体
            var isMultipartFormData = false;
            if (item.method && swagger.paths[item.path] && swagger.paths[item.path][item.method] && 
                swagger.paths[item.path][item.method].requestBody && 
                swagger.paths[item.path][item.method].requestBody.content && 
                swagger.paths[item.path][item.method].requestBody.content['multipart/form-data']) {
                isMultipartFormData = true;
            }
            
            if (isMultipartFormData) {
                // 为 multipart/form-data 生成明确的接口
                var model = `export interface ${item.action}FormData {
`;
                var childModel = '';
                for (var prop in schema.properties) {
                    var propSchema = schema.properties[prop];
                    // 处理包含点号的属性名
                    var formattedProp = prop;
                    if (/[^a-zA-Z0-9]/.test(prop)) {
                        formattedProp = `"${prop}"`;
                    }
                    propSchema.prop = formattedProp;
                    var propShape = handleSchema(propSchema, item);
                    var comment = ''
                    if (propSchema.description) {
                        comment += `   * ${propSchema.description}\n`
                    }
                    if (propSchema.format) {
                        comment += `   * format: ${propSchema.format}\n`
                    }
                    if (comment) {
                        model += `  /**\n${comment}   */\n`
                    }
                    var canNull = propSchema.nullable ? ' | undefined' : '';
                    model += '  ' + formattedProp + ': ' + propShape.def + canNull + ';\n';
                    childModel += propShape.model;
                }
                model += '}\n\n'
                shape.model = model;
                shape.model += childModel;
                shape.def = item.action + 'FormData';
            } else {
                for (var prop in schema.properties) {
                    var propSchema = schema.properties[prop];
                    propSchema.prop = prop;
                    var propShape = handleSchema(propSchema, item);
                    if (propShape.def === 'BinaryData' || propShape.def === 'BinaryData[]') {
                        shape.def = 'FormData';
                    } else {
                        shape.def = 'object';
                    }
                }
            }
        } else {
            shape.def = 'object';
        }
    } else if (schema['$ref']) {
        if (!pathAndInterfaces.find(e => e.path === item.path && e.ref === schema['$ref'] && e.method === item.method)) {
            pathAndInterfaces.push({path: item.path, ref: schema['$ref'], method: item.method})
            var ref = getRefObject(schema['$ref']);
            if (ref && ref.obj) {
                ref.obj.prop = ref.name;
                shape.def = ref.name;
                var refShape = handleSchema(ref.obj, item);
                shape.model += refShape.model;
            }
        } else {
            var ref = getRefObject(schema['$ref']);
            shape.def = ref.name;
        }
    } else if (schema.type == 'array') {
        if (schema.name) {
            shape.def = '  ' + schema.name + ` : []${nullable};\n`
        } else if (schema.items) {
            var refShape = handleSchema(schema.items, item);
            shape.def = refShape.def + '[]';
            shape.model = refShape.model;
        } else {
            shape.def = '[]';
        }
    }
    return shape;
}

function getRequestBodySchema(requestBody) {
    if (requestBody && requestBody.content) {
        // 优先处理 multipart/form-data 类型
        if (requestBody.content['multipart/form-data'] && requestBody.content['multipart/form-data'].schema) {
            return requestBody.content['multipart/form-data'].schema;
        }
        
        // 如果没有 multipart/form-data，则按原有逻辑处理
        var keys = Object.keys(requestBody.content);
        if (keys.length) {
            return requestBody.content[keys[0]].schema;
        }
    }
    return null;
}

function getHttpMethods(path) {
    var allMethodNames = ["post", "get", "delete", "put", 'patch'];
    var keys = Object.keys(swagger.paths[path]);
    var methodNames = allMethodNames.filter((e) => keys.indexOf(e) != -1);
    return methodNames;
}


function getRefObject(ref) {
    if (ref && typeof ref === 'string') {
        var nameIdx = ref.lastIndexOf('/') + 1;
        var name = ref.substring(nameIdx);
        let fml = ref.replaceAll('/', '.').replace('#', 'swagger');
        var dynObj = eval(fml);
        return {
            name: name,
            obj: dynObj
        }
    }
    return null;
}

function getSwaggerFile() {
    return new Promise((solve) => {
        https
            .get(fileUrl,
                (response) => {
                    let data = "";
                    response.on("data", (chunk) => {
                        data += chunk;
                    });

                    response.on("end", () => {
                        if (data) {
                            fs.writeFileSync(resolve("./swagger.json"), data);
                            solve(true);
                        }
                    });
                }
            )
            .on("error", (err) => {
                console.log("Error: " + err.message);
                solve(false)
            });
    })
}
