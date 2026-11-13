import { createRequire } from 'module'; const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'child_process';
const srv = spawn('npx',['vite','preview','--port','4177','--strictPort'],{cwd:'/home/claude/cash-factory-'});
await new Promise(r=>setTimeout(r,2500));
const out='/tmp/claude-0/-home-claude/579b6e4d-c2d3-59f2-9f21-2b4e6ccfc2e0/scratchpad/shots/';
const b = await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
const errs=[];
for (const [name,w,h,pix] of [['phone-pix',430,870,true],['phone-off',430,870,false],['tablet',820,1100,true]]) {
  const p = await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:1});
  p.on('pageerror',e=>errs.push(name+': '+e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(name+': '+m.text())});
  await p.addInitScript((pix)=>{localStorage.setItem('pcf_save_v1',JSON.stringify({}));},pix);
  await p.goto('http://localhost:4177/');
  await p.waitForFunction(()=>window.__pcf,{timeout:20000});
  await p.evaluate((pix)=>{const s=window.__pcf.state; s.settings.pixel=pix; s.money=1e6; s.levels.production=6; s.levels.automation=2; s.levels.storage=4; window.__pcf.ui.h.onSetting('pixel',pix);},pix);
  await p.waitForTimeout(9000);
  await p.screenshot({path:out+name+'.png'});
  if(name==='phone-pix'){
    await p.click('#assist'); await p.waitForTimeout(700);
    await p.screenshot({path:out+'assist.png'});
    console.log(await p.evaluate(()=>({manual:window.__pcf.state.stats.manualPushes,auto:window.__pcf.state.stats.autoPushes,active:window.__pcf.physics.active.length,money:window.__pcf.state.money})));
  }
  await p.close();
}
console.log('errors',errs);
await b.close(); srv.kill();
