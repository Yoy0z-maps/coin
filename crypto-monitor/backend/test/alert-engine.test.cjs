require('reflect-metadata');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {Prisma}=require('@prisma/client');const {Logger}=require('@nestjs/common');Logger.overrideLogger(false);
const {eligible,AlertEngine,alertMessage}=require('../dist/alert/alert-engine.service');
const {DiscordNotificationProvider}=require('../dist/notification/notification.provider');
const now=new Date();const base={id:'a',market:'KRW-BTC',condition:'BELOW',targetPrice:new Prisma.Decimal(95),enabled:true,triggerOnce:true,cooldownMinutes:60,lastTriggeredAt:null,updatedAt:now};
const ticker={market:'KRW-BTC',price:94,changeRate:-.01,timestamp:now.toISOString()};
const flush=()=>new Promise(r=>setTimeout(r,20));
test('inclusive ABOVE/BELOW boundaries, cooldown and once conditions',()=>{
 for(const [p,result] of [[96,false],[95,true],[94,true]])assert.equal(eligible(base,p,now),result);
 for(const [p,result] of [[96,true],[95,true],[94,false]])assert.equal(eligible({...base,condition:'ABOVE'},p,now),result);
 assert.equal(eligible({...base,enabled:false},94,now),false);
 assert.equal(eligible({...base,lastTriggeredAt:new Date(now-3600000)},94,now),false);
 assert.equal(eligible({...base,triggerOnce:false,lastTriggeredAt:new Date(now-3599999)},94,now),false);
 assert.equal(eligible({...base,triggerOnce:false,lastTriggeredAt:new Date(now-3600000)},94,now),true);
});
function fixture({failSend=false,failDB=false,claim=1}={}){
 let calls=0,sends=0,status;const alert={...base};
 const db={$transaction:async fn=>{calls++;if(failDB)throw Error();return fn({priceAlert:{updateMany:async()=>({count:claim})},priceAlertLog:{create:async()=>({id:'log'})}})},priceAlertLog:{update:async v=>{status=v.data.notificationStatus;}}};
 const cache={alerts:new Map([['KRW-BTC',[alert]]]),refresh:async()=>{}};
 const engine=new AlertEngine(db,cache,{}, {send:async()=>{sends++;if(failSend)throw Error();}},{discordWebhookUrl:'configured'});
 return {engine,alert,stats:()=>({calls,sends,status})};
}
test('ticker bursts claim/send once; unmatched tickers cause no DB access',async()=>{
 const f=fixture();for(let i=0;i<1000;i++)f.engine.onTicker({...ticker,price:96});assert.equal(f.stats().calls,0);
 for(let i=0;i<1000;i++)f.engine.onTicker(ticker);await flush();f.engine.onTicker(ticker);await flush();assert.deepEqual(f.stats(),{calls:1,sends:1,status:'SENT'});assert.equal(f.alert.enabled,false);
});
test('failed delivery records FAILED and does not release once claim',async()=>{const f=fixture({failSend:true});f.engine.onTicker(ticker);await flush();f.engine.onTicker(ticker);await flush();assert.deepEqual(f.stats(),{calls:1,sends:1,status:'FAILED'});});
test('DB failure throttled, CAS rejection never sends, stale ticker ignored',async()=>{
 const f=fixture({failDB:true});f.engine.onTicker(ticker);await flush();f.engine.onTicker(ticker);assert.equal(f.stats().calls,1);assert.equal(f.stats().sends,0);
 const g=fixture({claim:0});g.engine.onTicker(ticker);await flush();assert.equal(g.stats().sends,0);
 const h=fixture();h.engine.onTicker({...ticker,timestamp:new Date(now-120000).toISOString()});assert.equal(h.stats().calls,0);
});
test('message distinguishes previous close from 24h and uses KST',()=>{const m=alertMessage(base,ticker,now).content;assert.match(m,/전일 종가 대비/);assert.match(m,/KST/);assert.doesNotMatch(m,/24H/);});
test('Discord waits for confirmation, suppresses mentions, retries only 429 and sanitizes errors',async()=>{
 const original=global.fetch;let calls=0;
 try{
 global.fetch=async(url,options)=>{calls++;assert.equal(url.searchParams.get('wait'),'true');assert.deepEqual(JSON.parse(options.body).allowed_mentions,{parse:[]});return calls===1?{status:429,json:async()=>({retry_after:0})}:{status:200,ok:true,json:async()=>({id:'123'})};};
 const provider=new DiscordNotificationProvider({discordWebhookUrl:'https://discord.com/api/webhooks/123/test'});await provider.send({content:'test'});assert.equal(calls,2);
 global.fetch=async()=>{throw Error('SECRET')};await assert.rejects(provider.send({content:'test'}),e=>!e.message.includes('SECRET'));
 }finally{global.fetch=original;}
});
