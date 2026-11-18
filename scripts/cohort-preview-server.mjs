import {readFile,realpath,stat} from 'node:fs/promises';
import {isAbsolute,relative,resolve} from 'node:path';
import {cohortReview} from '../src/review/cohort-preview-model.js';

const endpoint='/__development/cohort-review';
const loopback=address=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address);
const localHost=value=>/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(value||'');

export function cohortPreviewServer({file=process.env.SCREENER_COHORT_REVIEW_FILE}={}) {
  let root;
  return {name:'private-cohort-preview',apply:'serve',
    configResolved(config){root=config.root;},
    configureServer(server){
      server.middlewares.use(async(req,res,next)=>{
        if(req.url?.split('?')[0]!==endpoint)return next();
        res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
        res.setHeader('Cross-Origin-Resource-Policy','same-origin');
        res.setHeader('Content-Type','application/json; charset=utf-8');
        if(req.method!=='GET'){res.statusCode=405;res.end('{"error":"REVIEW_METHOD_REJECTED"}');return;}
        let validOrigin=true;
        if(req.headers.origin){try{const origin=new URL(req.headers.origin);validOrigin=origin.protocol==='http:'&&origin.host===req.headers.host;}catch{validOrigin=false;}}
        if(!loopback(req.socket.remoteAddress)||!localHost(req.headers.host)||!validOrigin){res.statusCode=403;res.end('{"error":"REVIEW_LOCAL_ONLY"}');return;}
        try{
          if(!file||!isAbsolute(file))throw Error();
          const [checkout,input]=await Promise.all([realpath(root),realpath(resolve(file))]);
          const rel=relative(checkout,input);
          if(rel===''||(!rel.startsWith('../')&&rel!=='..'&&!isAbsolute(rel)))throw Error();
          const metadata=await stat(input);
          if(!metadata.isFile()||metadata.size>5_000_000)throw Error();
          const raw=await readFile(input,'utf8');
          cohortReview(JSON.parse(raw));
          res.statusCode=200;res.end(raw);
        }catch{
          res.statusCode=503;res.end('{"error":"COHORT_REVIEW_UNAVAILABLE"}');
        }
      });
    },
  };
}
