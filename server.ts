import page from "./src/index.html";

const server = Bun.serve({
  routes: { "/": page },
  development: true,
  port: Number(process.env.PORT ?? 3000),
});

console.log(`画布工作台已启动：${server.url}`);
