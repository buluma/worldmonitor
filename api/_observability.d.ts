export function withEdgeObservability(
  handlerName: string,
  handler: (request: Request) => Response | Promise<Response>,
): (request: Request) => Promise<Response>;
