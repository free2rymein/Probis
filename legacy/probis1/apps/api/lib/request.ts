export const getRequestId = (request: Request) =>
  request.headers.get("x-request-id") ?? crypto.randomUUID();

export const getRoute = (request: Request) => {
  const url = new URL(request.url);
  return url.pathname;
};
