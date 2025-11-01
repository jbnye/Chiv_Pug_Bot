export interface finish_pug_backend_props_type {
  pug_id: string;
  date: string;
  winner: 1 | 2;
  user_requested: {
    id: string;
    username: string;
    discriminator?: string;
    globalName?: string | null;
  };
}