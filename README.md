# koa-ssr-demo

```
git clone xxxx
cd koa-ssr-demo
npm install
node index.js
```

## 意图

当访问/users/:id时根据id去截取片段

如果id不为整数，则重定向到/error

除此两个路由都重定向到/error

处理不匹配路由，可根据status来跳转到404页面
