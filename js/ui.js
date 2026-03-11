/**
 * ui.js - Right-bottom info panel + all overlay helpers
 * WLD FoxWave ARDF
 *
 * Controls panel uses LARGE text (14px min) for readability.
 */
"use strict";

function drawInfoPanel(ctx, W, H, gameState) {
    ctx.fillStyle='#050f05'; ctx.fillRect(0,0,W,H);

    const foxH = _drawFoxStrip(ctx, W, H);
    _drawModeBanner(ctx, W, foxH, gameState);
    _drawControls(ctx, W, H, foxH+22, gameState);
    _drawMorseLegend(ctx, W, H);
}

// ── Fox strip ─────────────────────────────────────────────────────────────────
function _drawFoxStrip(ctx, W, H) {
    const sh = Math.min(Math.floor(H*0.28), 85);
    ctx.fillStyle='#080f08'; ctx.fillRect(0,0,W,sh);
    ctx.fillStyle='#1a3a1a'; ctx.fillRect(0,sh-1,W,1);

    ctx.fillStyle='#ffd700';
    ctx.font=`bold 13px "Orbitron",monospace`;
    ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.fillText('🦊  VOSSEN GEVONDEN', W/2, 5);

    const slotW=Math.floor((W-10)/CONFIG.FOX_COUNT);
    for(let i=0;i<CONFIG.FOX_COUNT;i++){
        const code=CONFIG.FOX_CODES[i], color=CONFIG.FOX_COLORS[i];
        const found=Player.foundFoxes.has(code);
        const sx=5+i*slotW, sy=22, sw=slotW-3, ssH=sh-26;

        ctx.fillStyle=found?color+'33':'#0a120a';
        ctx.strokeStyle=found?color:'#1e3a1e';
        ctx.lineWidth=found?2:0.8;
        ctx.fillRect(sx,sy,sw,ssH); ctx.strokeRect(sx,sy,sw,ssH);

        const cx_=sx+sw/2, cy_=sy+ssH/2;
        if(found){
            ctx.font=`${Math.min(22,sw*0.7)}px serif`;
            ctx.textAlign='center';ctx.textBaseline='middle';
            ctx.fillText('🦊',cx_,cy_-ssH*0.12);
            ctx.fillStyle=color;
            ctx.font=`bold ${Math.min(11,sw*0.32)}px "Orbitron",monospace`;
            ctx.textBaseline='bottom';
            ctx.fillText(code,cx_,sy+ssH-3);
        } else {
            ctx.fillStyle='#263a26';
            ctx.font=`${Math.min(18,sw*0.65)}px serif`;
            ctx.textAlign='center';ctx.textBaseline='middle';
            ctx.fillText('?',cx_,cy_);
            ctx.fillStyle='#2a4a2a';
            ctx.font=`bold 9px "Orbitron",monospace`;
            ctx.textBaseline='bottom';
            ctx.fillText(`#${i+1}`,cx_,sy+ssH-2);
        }
    }
    ctx.textBaseline='alphabetic'; ctx.textAlign='left';
    return sh;
}

// ── Mode banner ───────────────────────────────────────────────────────────────
function _drawModeBanner(ctx, W, y, gameState) {
    const bH=22;
    const map={
        [STATE.BRIEFING]:  {bg:'#0d1a0d',txt:'🏕  KLAAR OM TE STARTEN', c:'#888'},
        [STATE.HUNTING]:   {bg:'#0a2a0a',txt:'🦶  WANDELMODUS ACTIEF',  c:'#4ade80'},
        [STATE.RECEIVER]:  {bg:'#1a1a04',txt:'📡  RECEIVER ACTIEF',     c:'#ffd700'},
        [STATE.MAP_VIEW]:  {bg:'#04101a',txt:'🗺   KAARTMODUS ACTIEF',  c:'#44aaff'},
        [STATE.FINISHED]:  {bg:'#1a0a04',txt:'🏁  TERUG NAAR WLD-TENT!',c:'#ff8844'},
    };
    const m=map[gameState]||{bg:'#0a1a0a',txt:'',c:'#444'};
    ctx.fillStyle=m.bg; ctx.fillRect(0,y,W,bH);
    ctx.fillStyle='#0f2a0f'; ctx.fillRect(0,y+bH-1,W,1);
    ctx.fillStyle=m.c;
    ctx.font=`bold 11px "Orbitron",monospace`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(m.txt,W/2,y+bH/2);
    ctx.textBaseline='alphabetic';
}

// ── Controls (BIG, readable) ──────────────────────────────────────────────────
function _drawControls(ctx, W, H, startY, gameState) {
    const legendH=24;
    const avail=H-startY-legendH-6;

    // All sections
    const secs=[
        {
            id:STATE.HUNTING, icon:'🦶', title:'WANDELEN',
            rows:[
                {key:'↑↓←→', desc:'Stap op pad'},
                {key:'R',     desc:'Receiver AAN'},
                {key:'M',     desc:'Kaart tonen'},
                {key:'?',     desc:'Hint van ON4BB'},
            ]
        },{
            id:STATE.RECEIVER, icon:'📡', title:'RECEIVER / KOMPAS',
            rows:[
                {key:'← →',  desc:'Antenne draaien'},
                {key:'R',    desc:'Receiver UIT'},
                {key:'M',    desc:'Kaart tonen'},
            ]
        },{
            id:STATE.MAP_VIEW, icon:'🗺', title:'KAART & PEILINGEN',
            rows:[
                {key:'M',    desc:'Kaart open/sluit'},
                {key:'0–9',  desc:'Peiling typen (°)'},
                {key:'↵',    desc:'Lijn tekenen'},
                {key:'⌫',    desc:'Cijfer wissen'},
            ]
        },{
            id:'gen', icon:'⚙', title:'ALGEMEEN',
            rows:[
                {key:'H',    desc:'Start hunting'},
            ]
        },
    ];

    const totalRows=secs.reduce((s,sec)=>s+1+sec.rows.length,0);
    // TARGET: row height at least 20px for legibility
    const rowH=Math.max(20, Math.min(26, Math.floor(avail/totalRows)));
    const secH=rowH+2;
    const fs  =Math.max(12, Math.min(14, rowH-4));   // ≥12px font
    const keyW=Math.max(36, Math.min(50, Math.floor(W*0.26)));
    const pad =8;

    let cy=startY+4;

    for(const sec of secs){
        if(cy+secH>H-legendH-6) break;
        const active=sec.id===gameState||sec.id==='gen';

        // Section header
        ctx.fillStyle=active?'#0f2a0f':'#080f08';
        ctx.fillRect(0,cy,W,secH);
        ctx.fillStyle=active?'#4ade80':'#2a4a2a';
        ctx.font=`bold ${fs}px "Orbitron",monospace`;
        ctx.textAlign='left'; ctx.textBaseline='middle';
        ctx.fillText(`${sec.icon}  ${sec.title}`,pad,cy+secH/2);
        cy+=secH;

        for(const row of sec.rows){
            if(cy+rowH>H-legendH-6) break;

            ctx.fillStyle=active?'#070f07':'#050a05';
            ctx.fillRect(0,cy,W,rowH);

            // Key badge
            const badgeH=rowH-4;
            ctx.fillStyle=active?'#122212':'#090f09';
            ctx.strokeStyle=active?'#2a6a2a':'#141e14';
            ctx.lineWidth=1;
            ctx.fillRect(pad,cy+2,keyW,badgeH);
            ctx.strokeRect(pad,cy+2,keyW,badgeH);

            ctx.fillStyle=active?'#ffd700':'#2a4a2a';
            ctx.font=`bold ${fs}px "Share Tech Mono",monospace`;
            ctx.textAlign='center'; ctx.textBaseline='middle';
            ctx.fillText(row.key,pad+keyW/2,cy+rowH/2);

            ctx.fillStyle=active?'#b0e8b0':'#283828';
            ctx.font=`${fs}px "Share Tech Mono",monospace`;
            ctx.textAlign='left';
            ctx.fillText(row.desc,pad+keyW+7,cy+rowH/2);

            cy+=rowH;
        }
        ctx.fillStyle='#0f1f0f'; ctx.fillRect(0,cy,W,1); cy+=1;
    }
    ctx.textBaseline='alphabetic';
}

// ── Morse legend ──────────────────────────────────────────────────────────────
function _drawMorseLegend(ctx, W, H) {
    const lH=24, y=H-lH;
    ctx.fillStyle='#040a04'; ctx.fillRect(0,y,W,lH);
    ctx.fillStyle='#0f2a0f'; ctx.fillRect(0,y,W,1);
    const sw=(W-10)/CONFIG.FOX_COUNT;
    for(let i=0;i<CONFIG.FOX_COUNT;i++){
        const code=CONFIG.FOX_CODES[i], color=CONFIG.FOX_COLORS[i];
        const found=Player.foundFoxes.has(code);
        const morse=getFoxDisplayMorse(code);
        ctx.fillStyle=found?color:'#2a4a2a';
        ctx.font=`${Math.max(9,11)}px "Share Tech Mono",monospace`;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(`${code}:${morse}`,5+i*sw+sw/2,y+lH/2);
    }
    ctx.textBaseline='alphabetic';
}

// ── Overlay helpers ───────────────────────────────────────────────────────────
function showSplash()         {document.getElementById('overlay-splash').classList.remove('hidden');}
function hideSplash()         {document.getElementById('overlay-splash').classList.add('hidden');}
function showRegistration()   {document.getElementById('overlay-registration').classList.remove('hidden');}
function hideRegistration()   {document.getElementById('overlay-registration').classList.add('hidden');}
function showBriefing()       {document.getElementById('overlay-briefing').classList.remove('hidden');}
function hideBriefing()       {document.getElementById('overlay-briefing').classList.add('hidden');}
function showFinishedOverlay(){document.getElementById('overlay-finished').classList.remove('hidden');}
function hideFinishedOverlay(){document.getElementById('overlay-finished').classList.add('hidden');}

function showFoxFoundFlash(beacon) {
    const el=document.getElementById('fox-found-flash');
    const morse=getFoxDisplayMorse(beacon.code);
    el.innerHTML=`<div class="fox-found-inner">
        <div class="fox-found-icon">🦊</div>
        <div class="fox-found-code" style="color:${beacon.color}">${beacon.code}</div>
        <div class="fox-found-morse">${morse}</div>
        <div class="fox-found-msg">VOSJE GEVONDEN! &nbsp; ${Player.foundFoxes.size}/${CONFIG.FOX_COUNT}</div>
    </div>`;
    el.classList.remove('hidden'); el.classList.add('show');
    setTimeout(()=>{el.classList.remove('show');el.classList.add('hidden');},2500);
}
