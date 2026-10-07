// Explicit opt-in: sends one real temporary price alert.
const {localAccess}=require('../scripts/portfolio.cjs');
const assert=require('node:assert/strict');
const {setTimeout:delay}=require('node:timers/promises');
if(!process.argv.includes('--send'))throw Error('Use --send to authorize a real Discord price alert');
const {base,token}=localAccess();const headers={'X-Monitor-Token':token,'Content-Type':'application/json'};
async function call(path,method='GET',body){const r=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error('Local API request failed: '+r.status);return r.status===204?null:r.json();}
async function main(){
 let id;
 try{
 const a=await call('/alerts','POST',{market:'KRW-BTC',condition:'ABOVE',targetPrice:'1',triggerOnce:true});id=a.id;
 let found;
 for(let i=0;i<60;i++){found=(await call('/alerts/logs')).find(l=>l.alertId===id&&l.notificationStatus==='SENT');if(found)break;await delay(1000);}
 assert.ok(found,'Discord delivery not confirmed; inspect alert history');
 const saved=(await call('/alerts')).find(a=>a.id===id);assert.equal(saved.enabled,false);
 await delay(4000);assert.equal((await call('/alerts/logs')).filter(l=>l.alertId===id).length,1);
 console.log('PASS: real ticker → once alert → Discord SENT; no duplicate log');
 }finally{if(id)await call('/alerts/'+id,'DELETE');}
}
main().catch(()=>{console.error('FAIL: Discord live integration; inspect local alert history');process.exitCode=1;});
