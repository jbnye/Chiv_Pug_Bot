# Chiv PUG Bot

## What

**Chiv PUG Bot** is a Discord bot built to track and manage pick-up games (PUGs) for the _Chivalry: Medieval Warfare_ community.

The bot’s primary goals are to:

- Track **player win/loss records**
- Track **captain win/loss records**
- Rank players using the **TrueSkill matchmaking algorithm**
- Give players clear goals and a way to see how they stack up against others

By combining automated match tracking with skill-based ranking, the bot enhances competitive integrity and long-term engagement within the community.

---

## Why

_Chivalry: Medieval Warfare_ is no longer an active mainstream title, but a dedicated community continues to play nightly PUGs for fun and competition.

This community:

- Organizes games through a Discord server with **200+ members**
- Uses **captain snake picks** to form teams
- Includes players who have been active for **over 15 years**
- Represents a genuine grassroots effort to keep the game alive

I wanted to contribute to this effort by:

- Preserving match history
- Adding transparent, skill-based rankings
- Improving the overall PUG experience through automation and record keeping

This bot exists to **support and enhance a community-driven ecosystem**, not replace it.

---

## How

Chiv PUG Bot is built using the following technologies:

- **Node.js** with **TypeScript**
- **discord.js** for slash commands and interaction handling
- **PostgreSQL** (hosted on Railway) for persistent data storage:

  - Players
  - Match history
  - Win/loss records
  - TrueSkill ratings (μ and σ)

- **Redis** (Railway) for temporary and fast-access state:

  - Active PUGs
  - Recently finished matches

- **TrueSkill** (`ts-trueskill`) for skill rating calculations

### Architecture Overview

- Slash commands drive the full user experience
- Redis stores in-progress and recently completed games
- PostgreSQL stores authoritative historical data
- Finished or reverted matches correctly update ratings and statistics
- Command audit logging records all user interactions (command name, user, timestamp) for history, moderation, and debugging

---

## Features

### `/create_pug`

- Validates exactly **10 players**
- Allows captain selection via select menus
- Uses TrueSkill to generate balanced teams
- Displays a **match preview** with predicted outcomes

---

### `/finish_pug`

- Select an active PUG by match ID
- Choose the winning team
- Displays:

  - Before and after TrueSkill ratings
  - Elo changes (+ / −)

- Persists results to PostgreSQL

---

### `/cancel_pug`

- Select an active PUG
- Removes it from Redis
- Marks the match as **canceled** in the database

---

### `/revert_pug`

- Select from the **last two finished matches**
- Can only be reverted within **24 hours**
- Restores previous TrueSkill μ and σ values
- Correctly adjusts:

  - Wins
  - Losses
  - Captain statistics

- Removes the match from the finished PUG cache

---

### `/player_lookup`

- Look up a player by name
- Displays:

  - TrueSkill rating
  - Rank
  - Win/loss record
  - Captain win/loss record
  - Last three matches with results
  - Discord name and avatar

---

### `/leaderboard`

Three leaderboard views:

- **TrueSkill ranking**
- **Total wins**
- **Captain wins**

All players are sorted and displayed based on the selected metric.

---

### `/match_lookup`

- Enter a match ID
- View the full finished match preview and results

---

## Tech Highlights

- TrueSkill-based matchmaking
- Redis-backed ephemeral game state
- PostgreSQL for durable match history
- Fully slash-command driven UX
- Designed for rollback safety and data consistency
