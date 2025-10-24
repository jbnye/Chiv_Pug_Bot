import dotenv from 'dotenv';
dotenv.config(); 
import express, {RequestHandler, Express, Request, Response} from "express";


const port: number = parseInt(process.env.PORT || "3000");

const app: Express = express();

app.use(express.json());
app.get('/', (_req: Request, res: Response) => {
  res.send('Hello World!');
});

app.get("/api/ping", (_req,res)=> {
    res.send("Server is online");
});

app.listen(port,() => {
  console.log(`Server running on port ${port}`);
});

