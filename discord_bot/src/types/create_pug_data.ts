

export type create_pug_backend_props_type = {
    pug_id: string,
    date: Date,
    team1: { 
        id: string,
        username: string,
        displayName: string,
        globalName: string | null;
    }[],
    team2:  { 
        id: string,
        username: string,
        displayName: string,
        globalName: string | null;
    }[],
    user_requested: {
        id: string;
        username: string;
        discriminator: string;
        globalName: string | null;
    };
    playerSnapshots: {
        id: string
        username: string
        current: {
          mu: number
          sigma: number
          shown: number
        },

        win: {
          mu: number
          sigma: number
          shown: number
          delta: number
        },

        loss: {
          mu: number
          sigma: number
          shown: number
          delta: number
        }
    }[],
} 