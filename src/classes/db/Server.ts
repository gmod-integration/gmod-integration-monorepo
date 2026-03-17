import { ServerInput, ServerSchema } from '@gmod/schema/db/ServerSchema.js';

export class Server {
  public readonly token: string;
  public readonly id: string;
  public readonly guild: string;
  public readonly name: string;
  public readonly ip: string;
  public readonly port: string;
  public readonly image: string;
  public readonly verified: boolean;
  public readonly publicTempToken: string;
  public readonly description: string;
  public readonly isPublic: boolean;

  private constructor(data: ServerInput) {
    const parsed = ServerSchema.parse(data);
    this.token = parsed.token;
    this.id = parsed.id;
    this.guild = parsed.guild;
    this.name = parsed.name;
    this.ip = parsed.ip;
    this.port = parsed.port;
    this.image = parsed.image;
    this.verified = parsed.verified;
    this.publicTempToken = parsed.publicTempToken;
    this.description = parsed.description;
    this.isPublic = parsed.isPublic;
  }

  public static from(data: unknown): Server {
    return new Server(data as ServerInput);
  }
}
