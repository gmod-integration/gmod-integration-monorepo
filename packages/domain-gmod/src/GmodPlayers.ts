import { GmodAngle } from './GmodAngle.js';
import { GmodPosition } from './GmodPosition.js';
import { GmodTeam } from './GmodTeam.js';
import { type GmodPlayerInput, GmodPlayerSchema } from '@gmod/schema/gmod/GmodPlayerSchema.js';
import { GmodWeapon } from './GmodWeapon.js';

export class GmodPlayer {
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
  public readonly team: GmodTeam;
  public readonly position: GmodPosition;
  public readonly angle: GmodAngle;
  public readonly customValues: Record<string, any>;
  public readonly weapon: GmodWeapon;

  private constructor(data: GmodPlayerInput) {
    const parsed = GmodPlayerSchema.parse(data);
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
    this.team = GmodTeam.from(parsed.team);
    this.position = GmodPosition.from(parsed.position);
    this.angle = GmodAngle.from(parsed.angle);
    this.customValues = parsed.customValues || {};
    this.weapon = GmodWeapon.from(parsed.weapon);
  }

  public static from(data: unknown): GmodPlayer {
    return new GmodPlayer(data as GmodPlayerInput);
  }
}
