const Koa = require('koa');
const views = require('koa-views');
const Router = require('koa-router');
const router = new Router();
const path = require('path');
const app = new Koa();

app.use(views(path.join(__dirname, '/views'), {
	extension: 'ejs'
}))

let db = {
	users: [
		{
			name: '乐俊杰',
			password: '123'
		},
		{
			name: '乐俊杰',
			password: '123'
		},
		{
			name: '乐俊杰',
			password: '123'
		},
		{
			name: '乐俊杰',
			password: '123'
		},
		{
			name: 'sss',
			password: '234'
		},
		{
			name: 'sss',
			password: '234'
		},
		{
			name: 'sss',
			password: '234'
		},
		{
			name: 'sss',
			password: '234'
		}			
	],
	size: 4,
	errorMsg: '错误的页面'
}


function isFloatInteger (num) {
	return parseInt(num) == num;
}

router
	.get('/users/:id', async (ctx, next) => {
		// console.log('bbb')
		let id = ctx.params.id;
		if (isFloatInteger(id)) {
			let page = parseInt(id) - 1;
			let start = page*db.size;
			let end = (page + 1)*db.size;
			let items = db.users.slice(start, end);
			await ctx.render('users', {
				users: items
			})
		} else {
			ctx.redirect('/error');
		}
	})
	.get('/error', async (ctx, next) => {
		await ctx.render('error', {
			errorMsg: db.errorMsg
		})
	})
	// .get('/*', async (ctx, next) => {
	// 	ctx.redirect('/error');
	// })

app.use(async (ctx, next) => {
	await next();
	if (ctx.status === 404) {
		ctx.redirect('/error');
	}
})

app.use(router.routes())
	.use(router.allowedMethods());

app.listen(7000)