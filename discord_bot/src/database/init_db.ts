import pool from "./db";

export async function createDatabase() {
  try {
    console.log("Initializing database schema...");


    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.players (
        id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        discord_id TEXT UNIQUE,
        discord_username TEXT,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        captain_wins INTEGER DEFAULT 0,
        captain_losses INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        last_match_played TIMESTAMP,
        is_trusted BOOLEAN DEFAULT FALSE,
        mu DOUBLE PRECISION DEFAULT 25.0,
        sigma DOUBLE PRECISION DEFAULT 8.333,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);


    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.pugs (
        pug_id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        token TEXT NOT NULL UNIQUE,
        captain1_id TEXT REFERENCES public.players(discord_id) ON DELETE NO ACTION,
        captain2_id TEXT REFERENCES public.players(discord_id) ON DELETE NO ACTION,
        winner_team INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        verified_at TIMESTAMP,
        verified_by TEXT,
        reverted BOOLEAN DEFAULT FALSE
      );
    `);


    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE command_action AS ENUM ('created', 'finished', 'canceled', 'reverted', 'swap');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;

      CREATE TABLE IF NOT EXISTS public.commands (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        discord_id TEXT,
        discord_username TEXT,
        pug_token TEXT,
        action command_action NOT NULL,
        timestamp TIMESTAMP DEFAULT NOW()
      );
    `);


    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.mmr_history (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        discord_id TEXT REFERENCES public.players(discord_id) ON DELETE CASCADE,
        timestamp TIMESTAMP DEFAULT NOW(),
        mu_before DOUBLE PRECISION,
        mu_after DOUBLE PRECISION,
        sigma_before DOUBLE PRECISION,
        sigma_after DOUBLE PRECISION,
        pug_token TEXT REFERENCES public.pugs(token),
        team_number INTEGER,
        won BOOLEAN,
        mmr_change DOUBLE PRECISION
      );
    `);

    console.log("Database schema initialized successfully.");
  } catch (error) {
    console.error("Error creating tables:", error);
  } finally {
    
  }
}