import { GmodPlayer } from './GmodPlayers.js';
import { type GmodServerInput, GmodServerSchema } from '@gmod/schema/gmod/GmodServerSchema.js';

export class GmodServer {
  public readonly hostname: string;
  public readonly ip: string;
  public readonly port: number;
  public readonly map: string;
  public readonly players: number;
  public readonly playersList: GmodPlayer[];
  public readonly maxPlayers: number;
  public readonly gameMode: string;
  public readonly uptime: number;

  private constructor(data: GmodServerInput) {
    const parsed = GmodServerSchema.parse(data);
    this.hostname = parsed.hostname;
    this.ip = parsed.ip;
    this.port = parsed.port;
    this.map = parsed.map;
    this.players = parsed.players;
    this.playersList = parsed.playersList.map((player) => GmodPlayer.from(player));
    this.maxPlayers = parsed.maxPlayers;
    this.gameMode = parsed.gameMode;
    this.uptime = parsed.uptime;
  }

  public static from(data: unknown): GmodServer {
    return new GmodServer(data as GmodServerInput);
  }
}
