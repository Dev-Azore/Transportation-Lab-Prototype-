
/* HEAT Labs - Enhanced prototype
   Features added:
   - Tutorial overlay
   - Lamp component
   - Templates (Load example)
   - Save / Load via localStorage
   - Export / Import JSON
   - Screenshot export
   - Confetti on success
   - Pin LEDs, animated wires, snap-to-grid, code view (basic)
*/

// Minimal helpers
const qs = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));
const canvas = qs('#board');
const ctx = canvas.getContext('2d', { alpha: false });
let scale = 1;

function resizeCanvas(){
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * devicePixelRatio);
  canvas.height = Math.floor(rect.height * devicePixelRatio);
  scale = devicePixelRatio;
  ctx.setTransform(scale,0,0,scale,0,0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Models
let components = []; let wires = []; let nextId = 1;
const spec = { AND:{inputs:2,outputs:1}, OR:{inputs:2,outputs:1}, NOT:{inputs:1,outputs:1}, TIMER:{inputs:0,outputs:1}, LAMP:{inputs:1,outputs:0} };

function addComponent(type,x=100,y=100){
  const s = spec[type] || {inputs:0,outputs:1};
  const c = {
    id: nextId++, type, x, y, w:110, h:60,
    inputs: new Array(s.inputs).fill(false),
    outputs: new Array(s.outputs).fill(false),
    label:type,
    interval: (type==='TIMER')?1000:undefined,
    _state:false
  };
  components.push(c); saveToLocal(); render(); return c;
}
function getComp(id){ return components.find(c=>c.id===id); }

// Palette
qsa('.pal-item').forEach(btn => btn.addEventListener('click', ()=> {
  const t = btn.dataset.type; const rect = canvas.getBoundingClientRect();
  addComponent(t, Math.max(20, rect.width/2 - 50), Math.max(20, rect.height/2 - 30));
}));

// Interaction
let dragComp=null, dragOffset={x:0,y:0}, drawingWire=null, hoverComp=null;
canvas.addEventListener('pointerdown', ev=>{
  const p = getPointer(ev); const hit = hitTestComponent(p.x,p.y);
  if(hit){
    const {comp, area} = hit;
    if(area==='body'){ dragComp=comp; dragOffset.x = p.x-comp.x; dragOffset.y = p.y-comp.y; selectComp(comp); }
    else if(area.startsWith('out-')) { const pin=parseInt(area.split('-')[1],10); drawingWire={from:{compId:comp.id,pin}, x:p.x, y:p.y}; }
    else if(area.startsWith('in-')) { const pin=parseInt(area.split('-')[1],10); wires = wires.filter(w=>!(w.to.compId===comp.id && w.to.pin===pin)); render(); saveToLocal(); }
  } else { selectComp(null); }
});
canvas.addEventListener('pointermove', ev=>{
  const p = getPointer(ev);
  if(dragComp){ dragComp.x = snap(p.x - dragOffset.x); dragComp.y = snap(p.y - dragOffset.y); render(); }
  else if(drawingWire){ drawingWire.x=p.x; drawingWire.y=p.y; render(); }
});
canvas.addEventListener('pointerup', ev=>{
  const p = getPointer(ev);
  if(dragComp){ dragComp=null; saveToLocal(); return; }
  if(drawingWire){
    const hit = hitTestComponent(p.x,p.y);
    if(hit && hit.area.startsWith('in-')){
      const toPin = parseInt(hit.area.split('-')[1],10);
      wires = wires.filter(w => !(w.to.compId===hit.comp.id && w.to.pin===toPin));
      wires.push({ from: drawingWire.from, to:{ compId: hit.comp.id, pin: toPin }, id: Date.now() });
      saveToLocal();
    }
    drawingWire=null; render();
  }
});

// Pointer helpers
function getPointer(ev){ const rect = canvas.getBoundingClientRect(); return { x: (ev.clientX - rect.left), y: (ev.clientY - rect.top) }; }
function snap(v){ const grid=8; return Math.round(v / grid) * grid; }

// Hit test
function hitTestComponent(x,y){
  for(let i=components.length-1;i>=0;i--){ const c=components[i]; const lx=x-c.x, ly=y-c.y;
    for(let p=0;p<c.inputs.length;p++){ const px=-8, py=12+p*20; if(Math.hypot(lx-px, ly-py)<10) return {comp:c, area:`in-${p}`} }
    for(let p=0;p<c.outputs.length;p++){ const px=c.w+8, py=12+p*20; if(Math.hypot(lx-px, ly-py)<10) return {comp:c, area:`out-${p}`} }
    if(lx>=0 && ly>=0 && lx<=c.w && ly<=c.h) return {comp:c, area:'body'};
  } return null;
}

// Rendering
function render(){
  const rect = canvas.getBoundingClientRect(); ctx.clearRect(0,0,rect.width,rect.height);
  // wires animated
  wires.forEach(w=>{ const a=getPinPos(w.from.compId,'out',w.from.pin); const b=getPinPos(w.to.compId,'in',w.to.pin);
    const alive = getOutValue(w.from.compId,w.from.pin);
    ctx.lineWidth=3; ctx.strokeStyle = alive? '#7fffd4':'#3a5566';
    ctx.beginPath(); ctx.moveTo(a.x,a.y); const midX=(a.x+b.x)/2; ctx.bezierCurveTo(midX,a.y,midX,b.y,b.x,b.y); ctx.stroke();
    // pulse
    if(alive){ drawPulseAlong(a,b); }
  });
  // wire preview
  if(drawingWire){ const a=getPinPos(drawingWire.from.compId,'out',drawingWire.from.pin); const b={x:drawingWire.x,y:drawingWire.y};
    ctx.lineWidth=2; ctx.strokeStyle='#88ffb0'; ctx.beginPath(); ctx.moveTo(a.x,a.y); const mid=(a.x+b.x)/2; ctx.bezierCurveTo(mid,a.y,mid,b.y,b.x,b.y); ctx.stroke();
  }
  // components
  components.forEach(c=>{ ctx.fillStyle='#07212a'; ctx.fillRect(c.x,c.y,c.w,c.h); ctx.strokeStyle='#0f4f6e'; ctx.lineWidth=2; ctx.strokeRect(c.x,c.y,c.w,c.h);
    ctx.fillStyle='#93e0ff'; ctx.font='14px system-ui'; ctx.fillText(c.label || c.type, c.x+10, c.y+20);
    for(let p=0;p<c.inputs.length;p++){ const px=c.x-8, py=c.y+12+p*20; ctx.beginPath(); ctx.arc(px,py,8,0,Math.PI*2); ctx.fillStyle = c.inputs[p] ? '#ffd' : '#05323a'; ctx.fill(); ctx.stroke(); }
    for(let p=0;p<c.outputs.length;p++){ const px=c.x+c.w+8, py=c.y+12+p*20; ctx.beginPath(); ctx.arc(px,py,8,0,Math.PI*2); ctx.fillStyle = c.outputs[p] ? '#b3ffcc' : '#05323a'; ctx.fill(); ctx.stroke(); }
  });
  updateInspector(); updateCodeView();
}

// pulse animation along wire
function drawPulseAlong(a,b){
  // draw a small circle moving proportional to time
  const t = (Date.now() % 800) / 800;
  // simple linear interpolation along bezier - use t for approximate placement
  const x = a.x + (b.x - a.x) * t; const y = a.y + (b.y - a.y) * t;
  ctx.beginPath(); ctx.fillStyle='rgba(255,255,200,0.9)'; ctx.arc(x,y,4,0,Math.PI*2); ctx.fill();
}

// pin positions
function getPinPos(compId, kind, pinIndex){ const c=getComp(compId); if(!c) return {x:0,y:0}; if(kind==='in') return {x:c.x-8,y:c.y+12+pinIndex*20}; return {x:c.x+c.w+8,y:c.y+12+pinIndex*20}; }

// Logic evaluation
function evaluateAll(){
  const outMap={};
  components.forEach(c=>{
    if(c.type==='TIMER'){ c.outputs[0] = !!c._state; outMap[`${c.id}.0`]=c.outputs[0]; }
    else for(let i=0;i<c.outputs.length;i++){ c.outputs[i]=false; outMap[`${c.id}.${i}`]=false; }
  });
  components.forEach(c=>{ for(let i=0;i<c.inputs.length;i++){ const w = wires.find(w=>w.to.compId===c.id && w.to.pin===i); c.inputs[i]= w ? !!outMap[`${w.from.compId}.${w.from.pin}`] : false; } });
  for(let iter=0; iter<6; iter++){
    let changed=false;
    components.forEach(c=>{
      let newOuts=c.outputs.slice();
      if(c.type==='AND') newOuts[0] = c.inputs.reduce((a,b)=>a&&b,true);
      else if(c.type==='OR') newOuts[0] = c.inputs.reduce((a,b)=>a||b,false);
      else if(c.type==='NOT') newOuts[0] = !c.inputs[0];
      else if(c.type==='TIMER') newOuts[0] = !!c._state;
      else if(c.type==='LAMP') {} // lamps don't output
      for(let i=0;i<newOuts.length;i++){ if(c.outputs[i] !== newOuts[i]){ c.outputs[i]=newOuts[i]; changed=true; } }
    });
    components.forEach(c=>{ for(let i=0;i<c.outputs.length;i++) outMap[`${c.id}.${i}`]=!!c.outputs[i]; });
    components.forEach(c=>{ for(let i=0;i<c.inputs.length;i++){ const w=wires.find(w=>w.to.compId===c.id && w.to.pin===i); c.inputs[i]= w ? !!outMap[`${w.from.compId}.${w.from.pin}`] : false; }});
    if(!changed) break;
  }
}

// timers
const TICK_MS=200;
setInterval(()=>{ timerTick(); evaluateAll(); updateTrafficLights(); render(); }, TICK_MS);
function timerTick(){ components.forEach(c=>{ if(c.type==='TIMER'){ c._elapsed=(c._elapsed||0)+TICK_MS; const iv=c.interval||1000; if(c._elapsed>=iv){ c._elapsed=0; c._state=!c._state; } c.outputs[0]=!!c._state; } }); }

// traffic mapping
function updateTrafficLights(){
  const mapping = { 'ns-red':false,'ns-yellow':false,'ns-green':false,'ew-red':false,'ew-yellow':false,'ew-green':false };
  // direct lamp components: label exactly "NS_RED" etc.
  components.forEach(c=>{
    if(c.type==='LAMP' && c.label){
      const key = c.label.toLowerCase();
      if(key.includes('ns') && key.includes('red')) mapping['ns-red'] = c.inputs[0];
      if(key.includes('ns') && key.includes('yellow')) mapping['ns-yellow'] = c.inputs[0];
      if(key.includes('ns') && key.includes('green')) mapping['ns-green'] = c.inputs[0];
      if(key.includes('ew') && key.includes('red')) mapping['ew-red'] = c.inputs[0];
      if(key.includes('ew') && key.includes('yellow')) mapping['ew-yellow'] = c.inputs[0];
      if(key.includes('ew') && key.includes('green')) mapping['ew-green'] = c.inputs[0];
    }
  });
  // apply
  Object.keys(mapping).forEach(k=>{ const el = qs('#'+k); if(!el) return; if(mapping[k]) el.classList.add('on'); else el.classList.remove('on'); });
  qs('#status').textContent = 'Status: comps=' + components.length + ' wires=' + wires.length;
  // check success: if NS green and EW red (or similar) trigger confetti
  if(mapping['ns-green'] && !mapping['ew-green']) { maybeCelebrate(); }
}

// inspector and codeview
let selectedComp=null;
function selectComp(c){ selectedComp=c; updateInspector(); render(); }
function updateInspector(){ const ins = qs('#inspector'); if(!selectedComp){ ins.innerText='Tap a component to inspect.'; return; } ins.innerHTML = '<b>' + selectedComp.label + '</b>\\nType: ' + selectedComp.type + '\\nID: ' + selectedComp.id + '\\nInputs: ' + selectedComp.inputs.join(', ') + '\\nOutputs: ' + selectedComp.outputs.join(', '); }
function updateCodeView(){ // naive expression builder: list outputs and connected inputs
  const lines = [];
  components.forEach(c=>{ if(c.outputs.length>0){ c.outputs.forEach((o,idx)=>{ const outs = wires.filter(w=>w.from.compId===c.id && w.from.pin===idx); outs.forEach(oW=>{ const toComp=getComp(oW.to.compId); lines.push(`${c.label || c.type}.${idx} -> ${toComp.label || toComp.type}.in${oW.to.pin}`); }); }); }});
  qs('#codeview').innerText = lines.join('\\n') || '// no expressions yet';
}

// double-click to rename
canvas.addEventListener('dblclick', ev=>{ const p=getPointer(ev); const hit=hitTestComponent(p.x,p.y); if(hit && hit.area==='body'){ const newLabel=prompt('Label component (e.g., NS_GREEN, EW_RED, NS, EW):', hit.comp.label||''); if(newLabel!==null) hit.comp.label=newLabel; saveToLocal(); render(); }});

// seed template
function loadTemplate(){
  components = []; wires = []; nextId=1;
  const t = addComponent('TIMER', 60, 60); t.interval = 1000;
  const not1 = addComponent('NOT', 220,40);
  const and1 = addComponent('AND', 380,40);
  const lampNSG = addComponent('LAMP', 560, 20); lampNSG.label='NS_GREEN';
  const lampNSR = addComponent('LAMP', 560, 100); lampNSR.label='NS_RED';
  wires = [
    {from:{compId:t.id,pin:0}, to:{compId:not1.id,pin:0}, id:1},
    {from:{compId:not1.id,pin:0}, to:{compId:and1.id,pin:0}, id:2},
    {from:{compId:t.id,pin:0}, to:{compId:and1.id,pin:1}, id:3},
    {from:{compId:and1.id,pin:0}, to:{compId:lampNSG.id,pin:0}, id:4},
    {from:{compId:not1.id,pin:0}, to:{compId:lampNSR.id,pin:0}, id:5}
  ];
  // adjust nextId
  nextId = Math.max(...components.map(c=>c.id)) + 1;
  saveToLocal(); render();
}
qs('#btn-template').addEventListener('click', loadTemplate);

// save / load localStorage
const STORAGE_KEY = 'heatlabs-circuit-v1';
function saveToLocal(){ try{ const data={components,wires,nextId}; localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }catch(e){console.error(e)}}
function loadFromLocal(){ const raw = localStorage.getItem(STORAGE_KEY); if(!raw) return; try{ const d=JSON.parse(raw); components=d.components||[]; wires=d.wires||[]; nextId=d.nextId||(components.length+1); render(); }catch(e){console.error(e)}}
qs('#btn-save').addEventListener('click', ()=>{ saveToLocal(); alert('Saved locally'); });
qs('#btn-load').addEventListener('click', ()=>{ loadFromLocal(); alert('Loaded from local storage'); });

// export/import
qs('#btn-export').addEventListener('click', ()=>{ const data = {components,wires}; const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='circuit.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); });
qs('#file-import').addEventListener('change', (ev)=>{ const f=ev.target.files[0]; if(!f) return; const reader=new FileReader(); reader.onload=function(){ try{ const d=JSON.parse(this.result); components=d.components||[]; wires=d.wires||[]; nextId = Math.max(...components.map(c=>c.id))+1; saveToLocal(); render(); alert('Imported'); }catch(e){ alert('Invalid file'); }}; reader.readAsText(f); });
document.getElementById('btn-screenshot').addEventListener('click', ()=>{ const data = canvas.toDataURL('image/png'); const a=document.createElement('a'); a.href=data; a.download='heatlabs-screenshot.png'; a.click(); });

// import button trigger
document.getElementById('btn-export').addEventListener('click', ()=>{});
document.querySelector('#palette .palette-actions button:nth-child(3)').addEventListener('click', ()=>{ /* duplicate for old layout */ });

// screenshot helper (already above)

// Confetti
let confettiPlaying=false;
function maybeCelebrate(){ if(confettiPlaying) return; confettiPlaying=true; fireConfetti(); setTimeout(()=>confettiPlaying=false,2500); }
function fireConfetti(){ const cv=document.createElement('canvas'); cv.width=window.innerWidth; cv.height=window.innerHeight; cv.style.position='fixed'; cv.style.inset=0; cv.style.pointerEvents='none'; document.body.appendChild(cv); const cctx=cv.getContext('2d'); const pieces=[]; for(let i=0;i<150;i++){ pieces.push({x:Math.random()*cv.width, y:-Math.random()*cv.height, vx:(Math.random()*4-2), vy: (2+Math.random()*4), rot:Math.random()*360, color:`hsl(${Math.random()*360},80%,60%)`}); }
  const start=Date.now();
  const loop = ()=>{
    cctx.clearRect(0,0,cv.width,cv.height);
    pieces.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; cctx.save(); cctx.translate(p.x,p.y); cctx.rotate(p.rot*Math.PI/180); cctx.fillStyle=p.color; cctx.fillRect(-4,-2,8,4); cctx.restore(); });
    if(Date.now()-start<2000) requestAnimationFrame(loop); else cv.remove();
  }; loop();
}

// tutorial overlay
const tut = qs('#tutorial');
if(!localStorage.getItem('heatlabs-seen-tutorial')) tut.classList.remove('hidden');
qs('#tutorial-skip').addEventListener('click', ()=>{ tut.classList.add('hidden'); localStorage.setItem('heatlabs-seen-tutorial','1'); });
qs('#tutorial-done').addEventListener('click', ()=>{ tut.classList.add('hidden'); localStorage.setItem('heatlabs-seen-tutorial','1'); });

// load on start
loadFromLocal();
if(components.length===0) loadTemplate();

// selection inspector update handled in render()

// double click rename already in earlier prototype - replicate selection
canvas.addEventListener('click', ev=>{ const p=getPointer(ev); const hit=hitTestComponent(p.x,p.y); if(hit && hit.area==='body'){ selectComp(hit.comp); }});

canvas.addEventListener('dblclick', ev=>{ const p=getPointer(ev); const hit=hitTestComponent(p.x,p.y); if(hit && hit.area==='body'){ const newLabel=prompt('Label component (e.g., NS_GREEN, EW_RED, NS, EW):', hit.comp.label||''); if(newLabel!==null) { hit.comp.label=newLabel; saveToLocal(); render(); }}});

// helper to get output value quickly
function getOutValue(compId, outIdx){ const c=getComp(compId); if(!c) return false; return !!(c.outputs && c.outputs[outIdx]); }

// startup render
render();
