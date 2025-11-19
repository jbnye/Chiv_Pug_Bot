import pool from "./db";

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS players (
          id SERIAL PRIMARY KEY,
          discord_id TEXT UNIQUE,
          discord_username TEXT,
          discord_tag TEXT,
          mu FLOAT DEFAULT 25,          -- TrueSkill rating
          sigma FLOAT DEFAULT 3.333,    -- TrueSkill uncertainty
          wins INT DEFAULT 0,
          losses INT DEFAULT 0,
          captain_wins INT DEFAULT 0,
          captain_losses INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW(),
          last_match_played TIMESTAMP,
          is_trusted BOOLEAN DEFAULT FALSE
      );
    `);

    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE command_action AS ENUM ('created', 'finished', 'canceled', 'reverted', 'swap');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      CREATE TABLE IF NOT EXISTS commands (
        id SERIAL PRIMARY KEY,
        discord_id TEXT,
        discord_username TEXT,
        pug_token TEXT,
        action command_action NOT NULL,
        timestamp TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS pugs (
        pug_id SERIAL PRIMARY KEY,
        token TEXT UNIQUE,
        captain1_id INT REFERENCES players(id),
        captain2_id INT REFERENCES players(id),
        winner_team INT,
        created_at TIMESTAMP DEFAULT NOW(),
        verified_at TIMESTAMP,
        verified_by INT REFERENCES players(id)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS pug_players (
          id SERIAL PRIMARY KEY,
          pug_id INT REFERENCES pugs(pug_id),
          player_id INT REFERENCES players(id),
          team_number INT,
          is_captain BOOLEAN DEFAULT FALSE,
          mu_before FLOAT,
          sigma_before FLOAT,
          mu_after FLOAT,
          sigma_after FLOAT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS mmr_history (
          id SERIAL PRIMARY KEY,
          player_id INT REFERENCES players(id),
          pug_id INT REFERENCES pugs(pug_id),
          old_mu FLOAT,
          old_sigma FLOAT,
          new_mu FLOAT,
          new_sigma FLOAT,
          delta FLOAT, -- optional, new_mu - old_mu
          timestamp TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("Tables initialized successfully!");
  } catch (error) {
    console.error("Error creating tables:", error);
  } finally {
    await pool.end();
  }
})();