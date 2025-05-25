import { ServerInput, ServerSchema } from '../schemas/ServerSchema.js';
import { Player } from './Players.js';

export class Server {
  public readonly hostname: string;
  public readonly ip: string;
  public readonly port: number;
  public readonly map: string;
  public readonly players: number;
  public readonly playersList: Player[];
  public readonly maxPlayers: number;
  public readonly gameMode: string;
  public readonly uptime: number;

  private constructor(data: ServerInput) {
    const parsed = ServerSchema.parse(data);
    this.hostname = parsed.hostname;
    this.ip = parsed.ip;
    this.port = parsed.port;
    this.map = parsed.map;
    this.players = parsed.players;
    this.playersList = parsed.playersList.map((player) => Player.from(player));
    this.maxPlayers = parsed.maxPlayers;
    this.gameMode = parsed.gameMode;
    this.uptime = parsed.uptime;
  }

  public static from(data: unknown): Server {
    return new Server(data as ServerInput);
  }
}
