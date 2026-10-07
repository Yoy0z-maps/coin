const { localAccess } = require('../scripts/portfolio.cjs');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const { base, token } = localAccess();
const headers = { 'X-Monitor-Token':token, 'Content-Type':'application/json' };
async function call(path, method='GET', body, expected=200) {
  const response = await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,expected,`${method} ${path} status mismatch`);
  return expected===204?undefined:response.json();
}
async function waitFor(predicate) {
  for(let i=0;i<45;i++){try{const state=await call('/realtime');if(predicate(state))return state;}catch{}await delay(1000);}
  throw new Error('Realtime condition did not become ready');
}
let watchId,alertId;
async function main() {
  const existing=await call('/watchlist');const alerts=await call('/alerts');
  const market=['KRW-BTC','KRW-ETH','KRW-XRP','KRW-ADA'].find(m=>!existing.some(w=>w.market===m)&&!alerts.some(a=>a.market===m));
  assert.ok(market,'No unused test market; choose another market in the test script');
  try {
    const unauthorized=await fetch(base+'/watchlist');assert.equal(unauthorized.status,401);
    const watch=await call('/watchlist','POST',{market:market.toLowerCase()},201);watchId=watch.id;assert.equal(watch.market,market);
    await call('/watchlist','POST',{market},409);
    await call('/alerts','POST',{market,condition:'BELOW',targetPrice:0},400);
    let state=await waitFor(s=>s.status==='connected'&&s.tickers.some(t=>t.market===market&&t.streamType==='REALTIME'));
    assert.equal(typeof state.notificationEngineEnabled,'boolean');
    console.log('PASS: watchlist CRUD, validation and actual REALTIME WebSocket ticker');
    const controller=new AbortController();const response=await fetch(base+'/realtime/stream',{headers,signal:controller.signal});assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/event-stream/);
    const reader=response.body.getReader();const first=await reader.read();assert.ok(first.value.length);controller.abort();
    console.log('PASS: authenticated browser SSE stream');
    const alert=await call('/alerts','POST',{market,condition:'BELOW',targetPrice:'1',triggerOnce:false,cooldownMinutes:60},201);alertId=alert.id;
    await call('/alerts/'+alertId,'PATCH',{condition:'ABOVE',targetPrice:'1000000000',cooldownMinutes:120});
    await call('/watchlist/'+watchId,'DELETE',undefined,204);watchId=undefined;
    state=await call('/realtime');assert.ok(state.subscriptions.includes(market));assert.ok(state.activeAlertCount>=1);
    await call('/alerts/'+alertId,'PATCH',{enabled:false});await waitFor(s=>!s.subscriptions.includes(market));
    await call('/alerts/'+alertId,'PATCH',{enabled:true});await waitFor(s=>s.status==='connected'&&s.tickers.some(t=>t.market===market));
    console.log('PASS: alert-only subscription survives watch removal; enable/disable updates subscription');
    // This optional check restarts only this Backend, preserving PostgreSQL and other services.
    if(process.argv.includes('--restart')){
      const result=spawnSync('docker',['compose','restart','crypto-backend'],{cwd:resolve(__dirname,'../..'),encoding:'utf8',timeout:60000});
      assert.equal(result.status,0,'Backend restart failed');
      await waitFor(s=>s.status==='connected'&&s.subscriptions.includes(market)&&s.tickers.some(t=>t.market===market));
      assert.ok((await call('/alerts')).some(a=>a.id===alertId));
      console.log('PASS: persisted alert and subscription restored after Backend restart');
    }
    assert.ok(Array.isArray(await call('/alerts/logs')));
  } finally {
    if(watchId)await call('/watchlist/'+watchId,'DELETE',undefined,204);
    if(alertId)await call('/alerts/'+alertId,'DELETE',undefined,204);
  }
  console.log('PASS: temporary watchlist and alert records cleaned up');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
