import {Client, Pool, PoolClient} from "pg"
import pool from "../database/db"
import { RequestHandler, Router } from "express"
const router = Router();

const create_pug_handler: RequestHandler = async (req, res) => {

}


router.post("/check-guess", create_pug_handler);
export default router;