declare module 'ws' {
  import { EventEmitter } from 'events';
  import { IncomingMessage, OutgoingHttpHeaders } from 'http';

  export type RawData = Buffer | ArrayBuffer | Buffer[];

  export default class WebSocket extends EventEmitter {
    close(code?: number, data?: string | Buffer): void;
    ping(data?: unknown, mask?: boolean, cb?: (err?: Error) => void): void;
    send(data: string | Buffer, cb?: (err?: Error) => void): void;
    on(event: 'close', listener: () => void): this;
    on(event: 'message', listener: (data: RawData) => void): this;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options: {
      port: number;
      clientTracking?: boolean;
      verifyClient?: (
        info: { origin: string; secure: boolean; req: IncomingMessage },
        callback: (res: boolean, code?: number, message?: string, headers?: OutgoingHttpHeaders) => void,
      ) => void | Promise<void>;
    });

    on(event: 'connection', listener: (ws: WebSocket, req: IncomingMessage) => void): this;
    close(cb?: (err?: Error) => void): void;
  }
}
