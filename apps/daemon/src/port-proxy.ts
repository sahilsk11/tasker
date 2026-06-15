import { createServer, request } from "node:http";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    "listen-port": {
      default: "80",
      type: "string"
    },
    "target-port": {
      type: "string"
    }
  }
});

const listenPort = parsePort(values["listen-port"], "listen-port");
const targetPort = parsePort(values["target-port"], "target-port");

createServer((clientRequest, clientResponse) => {
  const upstream = request(
    {
      headers: clientRequest.headers,
      hostname: "127.0.0.1",
      method: clientRequest.method,
      path: clientRequest.url,
      port: targetPort
    },
    (upstreamResponse) => {
      clientResponse.writeHead(
        upstreamResponse.statusCode ?? 502,
        upstreamResponse.headers
      );
      upstreamResponse.pipe(clientResponse);
    }
  );

  upstream.on("error", (error) => {
    clientResponse.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    clientResponse.end(`Tasker proxy error: ${error.message}`);
  });

  clientRequest.pipe(upstream);
}).listen(listenPort, "127.0.0.1", () => {
  console.info(`Tasker proxy listening on 127.0.0.1:${String(listenPort)}`);
});

function parsePort(value: string | undefined, name: string): number {
  if (value == null) {
    throw new Error(`Missing --${name}`);
  }

  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid --${name}: ${value}`);
  }

  return port;
}
