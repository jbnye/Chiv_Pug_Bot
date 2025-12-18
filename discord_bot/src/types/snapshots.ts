export interface PlayerSnapshot {
  id: string;
  current: {
    mu: number;
    sigma: number;
    shown?: number;
  };
  win: {
    mu: number;
    sigma: number;
    delta?: number;
  };
  loss: {
    mu: number;
    sigma: number;
    delta?: number;
  };
}