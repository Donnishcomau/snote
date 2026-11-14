/**
 * #839: the fake Simperium server listens on 127.0.0.1 only, so no other host on the test machine's network
 * can read its synthetic notes or send it frames during a run (it bound every interface before), and its url names
 * that address, so no client depends on how `localhost` resolves (::1 first on the test host).
 */
import * as net from 'node:net';
import { FakeSimperiumServer } from './server';

const servers: FakeSimperiumServer[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.stop();
});

describe('#839 fake server: loopback only', () => {
  it('1: WHEN the fake server starts THEN `address()` is `127.0.0.1` (IPv4) and start() and `url` both give `ws://127.0.0.1:<port>`', async () => {
    const server = new FakeSimperiumServer();
    servers.push(server);
    const { port, url } = await server.start();
    const addr = (server as unknown as { httpServer: net.Server }).httpServer.address() as net.AddressInfo;
    expect(addr.address).toBe('127.0.0.1');
    expect(addr.family).toBe('IPv4');
    expect(addr.port).toBe(port);
    expect(url).toBe(`ws://127.0.0.1:${port}`);
    expect(server.url).toBe(`ws://127.0.0.1:${port}`);
  });

  it('2: WHEN a client connects to the port on `::1` THEN it gets no connection (an error, not `connect`)', async () => {
    const server = new FakeSimperiumServer();
    servers.push(server);
    const { port } = await server.start();
    const outcome = await new Promise<string>((resolve) => {
      const sock = net.connect({ host: '::1', port, autoSelectFamily: false });
      sock.once('connect', () => {
        sock.destroy();
        resolve('connect');
      });
      sock.once('error', (e: NodeJS.ErrnoException) => resolve(`error ${e.code ?? ''}`));
    });
    expect(outcome).toMatch(/^error /);
  });
});
