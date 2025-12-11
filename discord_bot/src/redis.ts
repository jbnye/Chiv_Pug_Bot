
import { createClient } from 'redis';
//import pool from './database/db';

console.log("REDIS URL ENV", process.env.REDIS_URL)
const redisClient = createClient({
    url: process.env.REDIS_URL,
});

redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
});



async function connectRedisAndLoad() {
    await redisClient.connect();
    console.log("Connected to Redis");
}

export { redisClient, connectRedisAndLoad };