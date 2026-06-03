export const getRequestId = (request: Request) =>
  request.headers.get("x-request-id") ?? crypto.randomUUID();

export const getRoute = (request: Request) => new URL(request.url).pathname;
