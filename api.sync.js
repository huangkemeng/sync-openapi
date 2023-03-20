#!/usr/bin/env node
const fs = require("fs");
let https = require("https");
const chalk = require("chalk");
const { resolve } = require("path");
const args = process.argv;
let swagger = {};
const pathAndInterfaces = [];
let fileUrl = '';
let output = './src/apis';
main();
async function main() {
  var urlIndex = args.indexOf('--url');
  if (urlIndex === -1) {
    return console.log(chalk.red('请先传入swagger配置的url地址！'));
  }
  else {
    fileUrl = args[urlIndex + 1];
    if (!fileUrl) {
      return console.log(chalk.red('请先传入swagger配置的url地址！'));
    }
    if (fileUrl.indexOf('http://') !== -1) {
      https = require('http');
    }
    else {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
  }
  var outputCmdIndex = args.indexOf('-o');
  if (outputCmdIndex !== -1 && args[outputCmdIndex + 1]) {
    output = args[outputCmdIndex + 1];
  }
  const existSwagger = fs.existsSync(resolve('./swagger.json'));
  var hasF = args.indexOf("-f") !== -1;
  if (!existSwagger || hasF) {
    console.log(chalk.blue(`正在从[${fileUrl}]获取新的swagger配置！`));
    var downResult = await getSwaggerFile();
    if (!downResult) {
      return console.log(chalk.red('swagger配置请求失败,请检查网络或url是否设置正确！'));
    }
  }
  else {
    console.log(chalk.blue('使用已存在的swagger配置！'));
  }
  const jsonString = fs.readFileSync(resolve("./swagger.json"));
  swagger = JSON.parse(jsonString);
  if ((!swagger.openapi && !swagger.swagger) || (swagger.openapi || swagger.swagger).split('.')[0] !== '3') {
    console.log(chalk.red('当前openapi版本不是3.x.x版本，无法保证生成的api配置全部正确，请酌情使用。'));
  }
  else {
    console.log(chalk.green(`当前openapi版本:${(swagger.openapi || swagger.swagger)},适用当前版本！`));
  }
  createActionDirs();
  return process.exit();
}

function pathConvertToUpperCamelCaseActionName(path, method) {
  var operationId = swagger['paths'][path][method]['operationId'];
  if (operationId) { return operationId; }
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
      actions.push({ path, action, method, summary });
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
  }
  else {
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

  actions.forEach((item) => {
    var tags = getTagsByPath(item.path, item.method);
    var actionPath = `${output}/${item.action}`;
    if (tags && tags.length) {
      var tag = tags[0];
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
    var indexFileContent = buildIndexFileContent(item, requestBodyContent.def || parameterContent.def, responseContent.def);
    indexFileContent += '\n\n' + (requestBodyContent.model || '') + (parameterContent.model || '') + (responseContent.model || '');
    fs.writeFileSync(resolve(actionPath + '/index.http.ts'), indexFileContent);
    fs.writeFileSync(resolve(actionPath + '/type.d.ts'), `declare global {\n  interface HttpApi {\n${summary}    ${item.action}: typeof import("./index.http").default;\n  }\n}\nexport { };`);
    console.log(chalk.yellow(`生成或更新了接口配置[${actionPath}]`));
    totalNew++;
  });
  console.log(chalk.green(`共生成或更新了${totalNew}个接口的配置！`));
}

function getTagsByPath(path, methodName) {
  var config = swagger["paths"][path][methodName];
  return config["tags"];
}

function buildIndexFileContent(item, paramName, responseName) {
  var paramDef = '';
  var paramRef = ''
  var url = '`' + item.path.replace(/\{(\w+)\}/g, '${request.$1}') + '`';
  if (paramName) {
    if (item.method == 'post' || item.method == 'put') {
      paramDef = `\n  data: ${paramName}\n`;
      paramRef = ', data';
      url = '`' + item.path.replace(/\{(\w+)\}/g, '${data.$1}') + '`';
    }
    else {
      paramDef = `\n  request: ${paramName}\n`;
      paramRef = ', { params: request }';
    }
  }
  var summary = ''
  if (item.summary.replaceAll(' ', '')) {
    summary = `/**\n * ${item.summary}\n */\n`
  }
  var responseDef = `<AxiosResponse<${responseName || 'any'}>>`
  return `import axios, { type AxiosResponse } from "axios";\n\n${summary}export default function ${item.action}(${paramDef}): Promise${responseDef} {\n  return axios.${item.method}(${url}${paramRef});\n}`
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
  if (!requestBody) { return ''; }
  var schema = getRequestBodySchema(requestBody);
  var shape = handleSchema(schema, item)
  return shape;
}

function buildParametersInterface(item) {
  var shape = { def: '', model: '' };
  var parameters = swagger['paths'][item.path][item.method]['parameters'];
  if (parameters) {
    var model = `interface ${item.action}Request {\n`;
    var childModel = '';
    parameters.forEach(parameter => {
      var nullable = !parameter.required ? '?' : ''
      if (parameter.required) {
        model += `  /**\n   * required: ${parameter.required}\n   */\n`
      }
      if (parameter.description) {
        model += `  /**\n   * ${parameter.description}\n   */\n`
      }
      if (parameter.schema) {
        var parameterShape = handleSchema(parameter.schema, item)
        model += '  ' + parameter.name + nullable + ': ' + parameterShape.def + ';\n';
        childModel += parameterShape.model;
      }
      else {
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
  var nullable = schema.nullable ? '?' : '';
  if (schema.type == 'integer' || schema.type == 'number') {
    if (schema.name) {
      shape.def = '  ' + schema.name + nullable + ' : number;\n'
    }
    else if (schema.prop && schema.enum) {
      shape.def = schema.prop;
      if (schema.description) {
        shape.model += `  /**\n   * ${schema.description}\n   */\n`
      }
      shape.model += `enum ${schema.prop} {\n${schema.enum.map(e => '  ' + (schema.prop + '_' + e).replace(/\W/g, '_') + ' = ' + e).join(',\n')}\n}\n\n`
    }
    else {
      shape.def = 'number';
    }
  }
  else if (schema.type == 'boolean') {
    if (schema.name) {
      shape.def = '  ' + schema.name + nullable + ' : boolean;\n'
    }
    else {
      shape.def = 'boolean';
    }
  }
  else if (schema.type == 'string') {
    if (schema.name) {
      shape.def = '  ' + schema.name + nullable + ' : string;\n'
    }
    else {
      if (schema.format === 'binary') {
        shape.def = 'BinaryData';
      }
      else {
        shape.def = 'string';
      }
    }
  }
  else if (schema.type == 'object') {
    if (schema.name) {
      shape.def = '  ' + schema.name + nullable + ' : object;\n'
    }
    else if (schema.prop) {
      shape.def = schema.prop;
      var model = `interface ${schema.prop} {\n`;
      var childModel = '';
      if (schema.properties && (Object.keys(schema.properties).length || schema.properties.length)) {
        for (var prop in schema.properties) {
          var propSchema = schema.properties[prop];
          propSchema.prop = prop;
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
          model += '  ' + (prop + (propSchema.nullable ? '?' : '') + ': ' + propShape.def) + ';\n';
          childModel += propShape.model;
        }
      }
      model += '}\n\n'
      shape.model = model;
      shape.model += childModel;
    }
    else if (schema.properties) {
      for (var prop in schema.properties) {
        var propSchema = schema.properties[prop];
        propSchema.prop = prop;
        var propShape = handleSchema(propSchema, item);
        if (propShape.def === 'BinaryData' || propShape.def === 'BinaryData[]') {
          shape.def = 'FormData';
        }
        else {
          shape.def = 'object';
        }
      }
    }
    else {
      shape.def = 'object';
    }
  }
  else if (schema['$ref']) {
    if (!pathAndInterfaces.find(e => e.path === item.path && e.ref === schema['$ref'] && e.method === item.method)) {
      pathAndInterfaces.push({ path: item.path, ref: schema['$ref'], method: item.method })
      var ref = getRefObject(schema['$ref']);
      if (ref && ref.obj) {
        ref.obj.prop = ref.name;
        shape.def = ref.name;
        var refShape = handleSchema(ref.obj, item);
        shape.model += refShape.model;
      }
    }
    else {
      var ref = getRefObject(schema['$ref']);
      shape.def = ref.name;
    }
  }
  else if (schema.type == 'array') {
    if (schema.name) {
      shape.def = '  ' + schema.name + nullable + ' : [];\n'
    }
    else if (schema.items) {
      var refShape = handleSchema(schema.items, item);
      shape.def = refShape.def + '[]';
      shape.model = refShape.model;
    }
    else {
      shape.def = '[]';
    }
  }
  return shape;
}

function getRequestBodySchema(requestBody) {
  if (requestBody && requestBody.content) {
    var keys = Object.keys(requestBody.content);
    if (keys.length) {
      return requestBody.content[keys[0]].schema;
    }
  }
  return null;
}

function getHttpMethods(path) {
  var allMethodNames = ["post", "get", "delete", "put"];
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
