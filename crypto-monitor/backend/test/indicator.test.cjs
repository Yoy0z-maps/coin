require('reflect-metadata');const {test}=require('node:test');const assert=require('node:assert/strict');
const {IndicatorService,sma,ema,rsi}=require('../dist/indicator/indicator.service');
const service=new IndicatorService();const now=new Date('2026-01-10T00:00:00Z');
const rows=(values)=>values.map((close,i)=>({timestamp:new Date(+now-(values.length-i)*3600000),open:close,high:close,low:close,close,volume:10}));
test('SMA and SMA-seeded EMA known values',()=>{assert.equal(sma([1,2,3,4],3),3);assert.deepEqual(ema([1,2,3,4,5],3),[2,3,4]);assert.equal(sma([1],20),null);});
test('Wilder RSI reference and rising/falling/flat cases',()=>{
 const prices=[44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28];assert.ok(Math.abs(rsi(prices)-70.464135)<.00001);
 assert.equal(rsi(Array.from({length:20},(_,i)=>i)),100);assert.equal(rsi(Array.from({length:20},(_,i)=>20-i)),0);assert.equal(rsi(Array(20).fill(1)),50);assert.equal(rsi([1,2]),null);
});
test('linear MACD alignment, signal, closed candles and previous 20 volume',()=>{
 const candles=rows(Array.from({length:100},(_,i)=>i+1));candles.at(-1).volume=20;
 const a=service.analyze([...candles,{...candles.at(-1),timestamp:now,close:999}], '1h',now);
 assert.equal(a.candleCount,100);assert.equal(a.excludedCandleCount,1);assert.equal(a.indicators.sma20,90.5);assert.equal(a.indicators.ema60,70.5);assert.equal(a.indicators.macd.macd,7);assert.equal(a.indicators.macd.signal,7);assert.equal(a.indicators.macd.histogram,0);assert.equal(a.volume.change,100);
});
test('insufficient history, gaps, zero volume and duplicate rejection',()=>{
 const a=service.analyze([], '1h',now);assert.equal(a.indicators.rsi14,null);assert.equal(a.volume.change,null);
 const c=rows(Array(60).fill(5)).map(r=>({...r,volume:0}));c.splice(5,1);assert.equal(service.analyze(c,'1h',now).gapCount,1);assert.equal(service.analyze(c,'1h',now).volume.change,null);
 assert.throws(()=>service.analyze([c[0],c[0]],'1h',now));
});
