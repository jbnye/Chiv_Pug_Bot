

export type finish_pug_backend_props_type = {
    winner: number,
    pug_id: string,
    user_requested: {
        id: string;
        username: string;
        discriminator: string;
        globalName: string | null;
    };
    date: Date,
} 