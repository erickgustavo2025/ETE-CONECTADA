// Backend de teste efêmero: executado por stdin somente no container do laboratório.
import { createServer } from 'node:http';

createServer(async (request, response) => {
  let bytes = 0;
  try {
    for await (const chunk of request) bytes += chunk.length;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ bytes, headers: request.headers }));
  } catch {
    response.destroy();
  }
}).listen(4100, '0.0.0.0');
