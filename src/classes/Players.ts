import { PlayerInput, PlayerSchema } from '../schemas/PlayerSchema.js';
import { Angle } from './Angle.js';
import { Position } from './Position.js';
import { Team } from './Team.js';

export class Player {
  public readonly steamID64: string;
  public readonly steamID: string;
  public readonly name: string;
  public readonly userGroup: string;
  public readonly kills: number;
  public readonly deaths: number;
  public readonly connectTime?: number;
  public readonly adjustedTime?: number;
  public readonly timeLastTeamChange?: number;
  public readonly ping?: number;
  public readonly fps?: number;
  public readonly branch?: 'unknown' | 'dev' | 'prerelease' | 'x86-64';
  public readonly team: Team;
  public readonly position: Position;
  public readonly angle: Angle;
  public readonly customValues: Record<string, any>;

  private constructor(data: PlayerInput) {
    const parsed = PlayerSchema.parse(data);
    this.steamID64 = parsed.steamID64;
    this.steamID = parsed.steamID;
    this.name = parsed.name;
    this.userGroup = parsed.userGroup;
    this.kills = parsed.kills;
    this.deaths = parsed.deaths;
    this.connectTime = parsed.connectTime;
    this.adjustedTime = parsed.adjustedTime;
    this.timeLastTeamChange = parsed.timeLastTeamChange;
    this.ping = parsed.ping;
    this.fps = parsed.fps;
    this.branch = parsed.branch;
    this.team = Team.from(parsed.team);
    this.position = Position.from(parsed.position);
    this.angle = Angle.from(parsed.angle);
    this.customValues = parsed.customValues || {};
  }

  public static from(data: unknown): Player {
    return new Player(data as PlayerInput);
  }
}
