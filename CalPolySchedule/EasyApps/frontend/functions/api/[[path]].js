export async function onRequest(context) {
  const url = new URL(context.request.url);
  const targetUrl = `https://calpolyschedule.onrender.com${url.pathname}${url.search}`;

  return fetch(targetUrl, {
    method: context.request.method,
    headers: context.request.headers,
    body: ["GET", "HEAD"].includes(context.request.method) ? undefined : context.request.body,
  });
}
