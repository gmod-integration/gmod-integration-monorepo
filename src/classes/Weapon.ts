import { WeaponInput, WeaponSchema } from '../schemas/WeaponSchema.js';

export class Weapon {
  public readonly class: string;
  public readonly printName: string;

  private constructor(data: WeaponInput) {
    const parsed = WeaponSchema.parse(data);
    this.class = parsed.class;
    this.printName = parsed.printName;
  }

  public static from(data: unknown): Weapon {
    return new Weapon(data as WeaponInput);
  }
}
