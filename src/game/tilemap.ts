import { T, isSolid, isOneWay, type Content } from './tiles';

export class TileMap {
  readonly tiles: Uint8Array;
  readonly contents = new Map<number, Content>();
  /** Hits taken by multi-token bricks. */
  readonly multiHits = new Map<number, number>();

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.tiles = new Uint8Array(w * h);
  }

  idx(tx: number, ty: number): number {
    return ty * this.w + tx;
  }

  inside(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }

  /**
   * Out of bounds: left/right edges are walls, below the map is open (pits),
   * above the map continues whatever solid sits in row 0 so walls can't be jumped over.
   */
  get(tx: number, ty: number): number {
    if (tx < 0 || tx >= this.w) return T.INVIS;
    if (ty >= this.h) return T.EMPTY;
    if (ty < 0) {
      const top = this.tiles[tx];
      return isSolid(top) ? top : T.EMPTY;
    }
    return this.tiles[ty * this.w + tx];
  }

  set(tx: number, ty: number, t: number): void {
    if (this.inside(tx, ty)) this.tiles[ty * this.w + tx] = t;
  }

  solid(tx: number, ty: number): boolean {
    return isSolid(this.get(tx, ty));
  }

  oneWay(tx: number, ty: number): boolean {
    return isOneWay(this.get(tx, ty));
  }

  content(tx: number, ty: number): Content | undefined {
    return this.contents.get(this.idx(tx, ty));
  }

  clone(): TileMap {
    const m = new TileMap(this.w, this.h);
    m.tiles.set(this.tiles);
    this.contents.forEach((v, k) => m.contents.set(k, v));
    return m;
  }
}
