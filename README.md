# 起步式

```
git clone xxxx
cd koa-ssr-demo
npm install
node index.js
```
访问localhost:7000/users/1

# 意图

当访问/users/:id时根据id去截取片段

如果id不为整数，则重定向到/error

除此两个路由都重定向到/error

处理不匹配路由，可根据status来跳转到404页面

# koa 源码

## 入口application.js

简化代码:
```
const Emitter = require('events');
const context = require('./context');
const request = require('./request');
const response = require('./response');
class Application extends EventEmmiter {
	constructor () {
		super();
		this.context = Object.create(context);
		this.request = Object.create(request);
	    this.response = Object.create(response);	
	}
	listen () {}
	toJSON () {}
	inspect () {}
	use () {}
	callback () {}
	handleRequest () {}
	createContext () {}
	onerror () {}
	respond () {}
}
```

### 从实例属性上手，看context，request，response分别是什么

#### context.js



```
class Context {
	inspect () {} // 返回json output
	toJSON () {} // 返回一个json，包含request,response,app,originalUrl,req,res,socket
	assert : httpAssert // 提供测试断言
	throw () {} // 抛出一个http error。statusCode,expose（暴露msg还是code）,msg
	onerror () {} // 默认错误处理，将错误委托给app
}
delegate(Context, 'response') // 将context实例的某些属性，代理到response上
	.method('redirect')
	.access('body')
	.getter('writable');
delegate(proto, 'request') // 将context实例的某些属性，代理到request上
	.method('get')
	.access('url')
	.getter('host')
```

在context.js中导出了一个proto对象，并将一些属性代理到 `context.request` 和 `context.response` 上

比如：

```
ctx.headers = ctx.request.headers
```

**这是怎么做到的呢？?**

```
class Delegator {
	constructor (proto, target) {
		if (!(this instanceof Delegator)) return new Delegator(proto, target); // 避免忘记了new 
		this.proto = proto;
		this.target = target;
		this.methods = [];
		this.getters = [];
		this.setters = [];
		this.fluents = [];		
	}
	method (name) {} // 将实例的name属性代理到this[target][name]上，并将name push进methods中
	access () {} // 定义getter和setter，link两个对象
	getter () {} // 用defineProperty，定义getter
	setter () {} // 用defineProperty，定义setter
	fluent () {}
}
```

发现问题： 

1. `Delegator` 中 `getter` 方法中的 `__defineGetter__` ，建议用 `Object.defineProperty` 代替


#### request.js

一系列的getter和setter

```
module.exports = {
	get header () {} // 返回requset headers
	set header (obj) {} // 设置request headers
	get origin () {} // `${this.protocol}://${this.host}`
	get href () {} // href
}
```

#### response.js

也是一系列的getter和setter, 略过

toJSON中的only方法：

将obj中的属性取出赋值到ret对象并return。这里用到了reduce方法。

```
module.exports = function(obj, keys){
  obj = obj || {};
  if ('string' == typeof keys) keys = keys.split(/ +/);
  return keys.reduce(function(ret, key){
    if (null == obj[key]) return ret;
    ret[key] = obj[key];
    return ret;
  }, {});
};
```

### 带着问题出发，深究use方法


先看use方法

1. 如果fn不是function则抛出TypeError
2. 如果fn为generator，则转换
3. 否则，将fn push 进 middleware(在this.callback()调用)

```
use(fn) {
    if (typeof fn !== 'function') throw new TypeError('middleware must be a function!');
    if (isGeneratorFunction(fn)) {
      deprecate('Support for generators will be removed in v3. ' +
                'See the documentation for examples of how to convert old middleware ' +
                'https://github.com/koajs/koa/blob/master/docs/migration.md');
      fn = convert(fn); // 转换成一个promise对象
    }
    debug('use %s', fn._name || fn.name || '-');
    this.middleware.push(fn);
    return this;
  }
```

有点忘记generator了，再看了一下es6

遍历嵌套数组

```
function* flat (arr) {
	for (var i = 0; i < arr.length; i++) {
		let item = arr[i];
		if (item instanceof Array) {
			yield* flat(item);
		} else {
			yield item;
		}
	}
}
const arr = [1, [2, 3], 4, [5, 6, [7, 8]]];
for (let val of flat(arr)) {
	console.log(val)
}
```


- 判断是否为generator function

```
function isGeneratorFunction(fn) {
	if (typeof fn !== 'function') {
		return false;
	}
	if (isFnRegex.test(fnToStr.call(fn))) { // 正则表达式/^\s*(?:function)?\*/
		return true;
	}
	if (!hasToStringTag) { // 不支持Symbol
		var str = toStr.call(fn);
		return str === '[object GeneratorFunction]';
	} 
	return getProto(fn) === GeneratorFunction;
}
```

### 接着listen

koa/application.js

```
listen(...args) {
    debug('listen');
    const server = http.createServer(this.callback());
    return server.listen(...args);
}
callback() {
    const fn = compose(this.middleware);
    
    if (!this.listeners('error').length) this.on('error', this.onerror);
    
    const handleRequest = (req, res) => {
      const ctx = this.createContext(req, res);
      return this.handleRequest(ctx, fn);
    };
    
    return handleRequest;
}
```

此间，`http.createServer(this.callback())` 是一个很庞大的函数体

下面我们来理一理：

1. `http.createServer`
2. 转到node原生模块http，`new Server(requestListener)`

```
// 此解释是针对无options的情况

class HttpServer extends net.Server {
	constructor (options, requestListener) {
		requestListener = options;
		options = {};
		super({ allowHalfOpen: true });
		this.on('request', requestListener);
		this.on('connection', connectionListener);
	}
}
```

**采用倒推法** ，既然这儿已经注册了 `request` 的监听器，那么去找哪里`emit('request')`

#### _http_server.js中

由下往上读

```
function parserOnIncoming () {
    server.emit('request', req, res) // 触发request事件
}

|

function connectionListenerInternal () {
    var parser = parsers.alloc(); // 创建parser对象
    parser.onIncoming = parserOnIncoming.bind(undefined, server, socket, state);
}

|

function connectionListener(socket) {
  defaultTriggerAsyncIdScope(
    getOrSetAsyncId(socket), connectionListenerInternal, this, socket
  );
}

|

function Server () {
    this.on('connection', connectionListener); // 先触发connection再触发的request
}

```

找到了源头，这儿先监听了 `connection` 事件，等 `connection` 触发之后再触发的 `request` 事件，接下来我们来看看哪里触发的

**在net.js中**

```
function onconnection (err, clientHandle) {
    this.owner.emit('connection', socket) // 此处owner还有疑问，暂时没有解决
}
```

这儿有个疑问，这儿的parser又是什么呢 ？parser原来实在 `_http_common.js` 中实例化的对象

#### _http_common.js中导出了上述的parsers

```
var parsers = new FreeList('parsers', 1000, function() {
    var parser = new HTTPParser(HTTPParser.REQUEST);
    return parser
}

|

当request headers组织好后，调用下列方法

function parserOnHeadersComplete () {
    return parser.onIncoming(parser.incoming, shouldKeepAlive) // 这儿parser.incoming就是req对象
}
```

#### internal/freelist.js解释了new FreeList()实际返回一个callback()返回的对象，即上述的HTTPParser实例

```
class FreeList {
    constructor (name, max, ctor) {}
    alloc() {
        return this.list.length ?
        this.list.pop() :
        this.ctor.apply(this, arguments);
    }
}
```

3. 这个Server，乃 `_http_server.js`  导出的Server。此Server又继承自 `net.Server` 

简单介绍一下 `net.Server` :

```
class Server extends EventEmitter{
    constructor (options) {
        super(options);
    }
    listen (...args) {
        
    }
}
```

#### 回到koa/application看this.callback()

```
callback() {
    const fn = compose(this.middleware); // 这儿compose

    if (!this.listeners('error').length) this.on('error', this.onerror);

    const handleRequest = (req, res) => {
      const ctx = this.createContext(req, res);
      return this.handleRequest(ctx, fn);
    };

    return handleRequest;
  }
  
  handleRequest(ctx, fnMiddleware) {
    const res = ctx.res;
    res.statusCode = 404;
    const onerror = err => ctx.onerror(err);
    const handleResponse = () => respond(ctx);
    onFinished(res, onerror);
    return fnMiddleware(ctx).then(handleResponse).catch(onerror);
  }
```

1. compose实际就是起一个中间件的暴露作用，从第一个中间件开始，每次执行next则转到下一个中间件

compose函数每次next则dispatch下一个中间件

自己造了一个compose

```
const ctx = {
	a: 1,
	b: 2,
	c: 3,
	d: 4
}

async function fn1 (ctx, next) {
	console.log(ctx.a);
	next();
	console.log(ctx.d);
}
async function fn2 (ctx, next) {
	console.log(ctx.b);
	next();
	console.log(ctx.c);
}
async function fn3 (ctx, next) {
	console.log('finish');
}

const middleware = [fn1, fn2, fn3]

function compose (middleware) {
	return function (ctx) {
		var index = -1;
		return dispatch(0)
		function dispatch (i) {
			index = i;
			if (i === middleware.length - 1) {
				return 
			} else {
				var fn = middleware[i];
				return Promise.resolve(fn(ctx, function next () {
					return dispatch(i + 1);
				}))
			}
		}		
	}
}

let fn = compose(middleware);

fn(ctx).then(() => {
	console.log('finished')
});

// 1
// 2
// 3
// 4
// finished
```

2. 返回一个listen的回调函数

```
return (req, res) => {
	const ctx = this.createContext(req, res);
	return this.handleRequest(ctx, fn);
};
```

最后执行

```
respond(ctx)

function respond (ctx) {
    // 对res的body，status等等的处理。也就是善后工作
}
```

# koa-router源码

先贴一段应用的代码，然后带着代码中的问题去深入

其实，koa-router的源码并不多。

```
const Koa = require('koa');
const Router = require('koa-router');
const router = new Router();
const app = new Koa();

router.get(path, async (ctx, next) => {})

app.use(router.routes())
```

发现问题：

1. 这儿的router.get是怎么做到的呢
2. router.routes这个中间件有什么用


带着问题去看代码，我的习惯是一个一个function的找

简化一下代码：

```
class Router {
	constructor () {
		methods.forEach(function (method) {
			Router.prototype[method] = function (name, path, middleware) {
				// ....
				this.register(path, [method], middleware, {
					name: name
				});

				return this;
			};
		});
	}
	register (path, methods, middleware, opts) {
		opts = opts || {};

		var router = this;

		// support array of paths

		// create route
		var route = new Layer(path, methods, middleware, {});
		
		this.stack.push(route);

		return route;
	}
	routes () {
	    return () => {
	        var matched = this.match(ctx.path, ctx.method)
	        // ...
	        return compose(layerChain)(ctx, next)
	    }
	}
	match () {
	    for (var len = layers.length, i = 0; i < len; i++) {
        layer = layers[i];
    
        if (layer.match(path)) {
          matched.path.push(layer);
        }
        return matched;
      }
	}
	
}
```

解释：

1. 这里的mothods即包含get，post等已枚举好了的数组
2. register方法的作用是注册一个route，然后push到stack里，之后再router.routes()调用
3. Layer是一个用于创建route的类


```
class Layer {
    constructor (path, methods, middleware, opt) {}
    match () {} // 判断request是否match这个path
    params () {}
}
```

4. routes中间件触发后就会将一个个匹配path的middleware触发，期间用了koa-compose。之前已叙述过，这里不再叙述



## 应用时出现的问题

如果想匹配不支持的url，然后转到404页面，可以直接根据status来跳转

```
// handle 404 etc.
app.use(async (ctx, next) => {
  try {
    await next()
    if (ctx.status === 404) {
      // do somthing here
    }
  } catch (err) {
    // handle error
  }
})
```







