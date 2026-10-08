import 'dotenv/config';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL não configurada');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
const c=await pool.connect();
try{await c.query('begin');await c.query(await readFile(new URL('./migrations/20261008-google-planilhas.sql',import.meta.url),'utf8'));await c.query('commit');console.log('Google Planilhas: migração aplicada.');}
catch(e){await c.query('rollback');throw e;}finally{c.release();await pool.end();}
