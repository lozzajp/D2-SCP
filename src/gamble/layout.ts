export const GRID_COLUMNS = 10;
export const GRID_ROWS = 10;

export const NO_CELL = -1;

export function cellOf(x: number, y: number): number {
  return x + y * GRID_COLUMNS;
}

export class WindowGrid {
  private readonly used = new Uint8Array(GRID_COLUMNS * GRID_ROWS);

  clear(): void {
    this.used.fill(0);
  }

  isFree(x: number, y: number, width: number, height: number): boolean {
    if (x < 0 || y < 0 || x + width > GRID_COLUMNS || y + height > GRID_ROWS) return false;
    for (let row = y; row < y + height; row++) {
      for (let col = x; col < x + width; col++) if (this.used[cellOf(col, row)]) return false;
    }
    return true;
  }

  occupy(x: number, y: number, width: number, height: number): void {
    for (let row = y; row < y + height; row++) {
      for (let col = x; col < x + width; col++) this.used[cellOf(col, row)] = 1;
    }
  }

  place(width: number, height: number): number {
    const fromRight = height === 1;
    for (let i = 0; i <= GRID_COLUMNS - width; i++) {
      const x = fromRight ? GRID_COLUMNS - width - i : i;
      for (let y = 0; y + height <= GRID_ROWS; y++) {
        if (this.isFree(x, y, width, height)) {
          this.occupy(x, y, width, height);
          return cellOf(x, y);
        }
      }
    }
    return NO_CELL;
  }
}
