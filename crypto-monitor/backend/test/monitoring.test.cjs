require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Subject } = require('rxjs');
const { Logger } = require('@nestjs/common');
const { alertInput, bodyObject } = require('../dist/common/input');
const { subscriptionUnion, StateCache } = require('../dist/state/state-cache.service');
const { mapLiveTicker, reconnectDelay, BithumbWebSocketClient } = require('../dist/bithumb/bithumb-websocket.client');
const { SessionService } = require('../dist/access/session.service');
const { PortfolioGuard } = require('../dist/portfolio/portfolio.guard');
Logger.overrideLogger(false);
const valid = { market:'BTC', condition:'BELOW', targetPrice:'95000000', cooldownMinutes:60 };
const raw = {type:'ticker',code:'KRW-BTC',trade_price:95000000,signed_change_rate:-.02,acc_trade_volume_24h:100,timestamp:1790126400000,stream_type:'REALTIME'};

test('alert input validates exact price, conditions, booleans and cooldown', () => {
  assert.equal(alertInput(valid).market,'KRW-BTC');
  assert.equal(alertInput({...valid,targetPrice:'0.0000000001'}).targetPrice,'0.0000000001');
  assert.deepEqual(alertInput({enabled:false},true),{enabled:false});
  for(const change of [{condition:'above'},{targetPrice:0},{targetPrice:'NaN'},{targetPrice:'-1'},{targetPrice:'0.00000000001'},{enabled:'true'},{cooldownMinutes:0},{cooldownMinutes:1.2},{cooldownMinutes:10081},{lastTriggeredAt:'arbitrary'}]) assert.throws(()=>alertInput({...valid,...change}));
  assert.throws(()=>alertInput({},true));
  assert.throws(()=>bodyObject([],[]));
});

test('subscriptions retain alert-only markets, deduplicate and exclude disabled records', () => {
  assert.deepEqual(subscriptionUnion([{market:'KRW-BTC',enabled:true},{market:'KRW-ETH',enabled:false}], [{market:'KRW-BTC',enabled:true},{market:'KRW-XRP',enabled:true}]),['KRW-BTC','KRW-XRP']);
  assert.deepEqual(subscriptionUnion([], [{market:'KRW-BTC',enabled:true}]),['KRW-BTC']);
});

test('state cache builds active alert map and keeps last data on database failure', async () => {
  let fail=false;
  const db={ watchlist:{findMany:()=>[{market:'KRW-BTC',enabled:true}]},priceAlert:{findMany:()=>[{id:'1',market:'KRW-ETH',enabled:true}]},$transaction:async rows=>{if(fail)throw Error('private detail');return rows;} };
  const cache=new StateCache(db);await cache.refresh();assert.deepEqual(cache.markets,['KRW-BTC','KRW-ETH']);assert.equal(cache.alerts.get('KRW-ETH').length,1);
  fail=true;await assert.rejects(cache.refresh(),/Monitoring configuration unavailable/);assert.equal(cache.healthy,false);assert.equal(cache.alerts.get('KRW-ETH').length,1);
});

test('WebSocket response normalization and reconnect delays follow documented units', () => {
  assert.equal(mapLiveTicker(raw).market,'KRW-BTC');assert.equal(mapLiveTicker(raw).price,95000000);
  assert.equal(mapLiveTicker({...raw,trade_price:'95000000'}),null);assert.equal(mapLiveTicker({...raw,timestamp:NaN}),null);assert.equal(mapLiveTicker({error:{name:'error'}}),null);
  assert.deepEqual([0,1,2,3,4,5,6,20].map(reconnectDelay),[1000,2000,4000,8000,16000,30000,30000,30000]);
});

class FakeSocket extends EventEmitter {
  readyState=0; sent=[]; pings=0;
  send(value){this.sent.push(JSON.parse(value));}
  ping(){this.pings++;}
  open(){this.readyState=1;this.emit('open');}
  terminate(){if(this.readyState!==3){this.readyState=3;this.emit('close');}}
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('single socket resubscribes after close, supports dynamic removal and never queries DB per ticker', async t => {
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  let reads=0;const cache={markets:['KRW-BTC'],healthy:true,alerts:new Map(),changes:new Subject(),refresh:async()=>{reads++;}};
  const sockets=[];
  const client=new BithumbWebSocketClient(cache,url=>{assert.equal(url,'wss://ws-api.bithumb.com/websocket/v1');assert.ok(sockets.every(s=>s.readyState===3));const socket=new FakeSocket();sockets.push(socket);return socket;});
  t.after(()=>client.onModuleDestroy());
  client.onModuleInit();t.mock.timers.tick(300);await flush();assert.equal(sockets.length,1);sockets[0].open();assert.deepEqual(sockets[0].sent[0][1].codes,['KRW-BTC']);
  const before=reads;for(let i=0;i<1000;i++)sockets[0].emit('message',Buffer.from(JSON.stringify(raw)));assert.equal(reads,before);assert.equal(client.snapshot().receivedCount,1000);
  sockets[0].terminate();t.mock.timers.tick(1000);await flush();assert.equal(sockets.length,2);sockets[1].open();assert.equal(reads,before+1);
  cache.markets=['KRW-ETH'];cache.changes.next();assert.equal(sockets[1].readyState,3);t.mock.timers.tick(2000);await flush();assert.equal(sockets.length,3);sockets[2].open();assert.deepEqual(sockets[2].sent[0][1].codes,['KRW-ETH']);assert.equal(client.snapshot().tickers.length,0);
  cache.markets=[];cache.changes.next();assert.equal(client.snapshot().status,'idle');
});

test('missing PONG causes terminate and bounded reconnect scheduling', async t => {
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const cache={markets:['KRW-BTC'],healthy:true,alerts:new Map(),changes:new Subject(),refresh:async()=>{}};
  const socket=new FakeSocket();const client=new BithumbWebSocketClient(cache,()=>socket);t.after(()=>client.onModuleDestroy());
  await client.connect();socket.open();t.mock.timers.tick(25000);assert.equal(socket.pings,1);t.mock.timers.tick(25000);assert.equal(socket.readyState,3);assert.equal(client.snapshot().status,'reconnecting');
});

test('session cookie is accepted, logout revokes it and cross-origin access is denied',()=>{
  const sessions=new SessionService();const cookie='monitor_session='+sessions.create();
  assert.equal(sessions.valid(cookie),true);const guard=new PortfolioGuard({portfolioApiToken:'x'.repeat(64)},sessions);
  const context=origin=>({switchToHttp:()=>({getResponse:()=>({setHeader:()=>{}}),getRequest:()=>({headers:{cookie,host:'127.0.0.1:3000',origin}})})});
  assert.equal(guard.canActivate(context('http://127.0.0.1:3000')),true);
  assert.throws(()=>guard.canActivate(context('http://untrusted.example')),e=>e.getStatus()===403);
  sessions.remove(cookie);assert.equal(sessions.valid(cookie),false);assert.throws(()=>guard.canActivate(context()),e=>e.getStatus()===401);
});
