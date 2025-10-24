import {Pool} from "pg";
import dotenv from 'dotenv';
dotenv.config();
console.log(process.env.DATABASE_URL, "database");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
pool.connect()
    .then(client => {
        console.log('connected to Postgres');
        client.release();
    })
    .catch(err => {
        console.error('Failed to connect to Postgres', err);
    });

export default pool;