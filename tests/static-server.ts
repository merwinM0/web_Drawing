// Serve only build artifacts to exercise the same hash routes without Bun's dev bundler.
const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/favicon.ico") return new Response(null, { status: 204 });
    const name = pathname === "/" ? "index.html" : pathname.slice(1);
    if (!/^[\w.-]+$/.test(name)) return new Response("Not found", { status: 404 });
    const file = Bun.file(new URL(`../dist/${name}`, import.meta.url));
    return await file.exists() ? new Response(file) : new Response("Not found", { status: 404 });
  },
});
console.log(`静态构建测试服务：${server.url}`);
