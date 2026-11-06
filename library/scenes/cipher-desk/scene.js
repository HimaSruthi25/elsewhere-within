// Cipher Desk — a detective's desk with a new cipher every day (Dashboard). Idea: Hima.
// Picture (AI illustration, 1920×1080, blank paper in the middle) + live 2D code layers:
//   09:00 a new cipher is typed on the paper; 12:00 the key, 15:00 the cipher name,
//   17:00 the first word appear in pencil; 18:00 the answer is written in ink, followed by
//   "How it was solved". Before 09:00 yesterday's solved case stays on the desk.
//   The level rises day by day (counted from the first day the scene runs on this PC,
//   kept in localStorage): Caesar 1–3, Atbash, number code, keyboard code, Caesar + backwards
//   words, then Caesar without spaces, keyword, Vigenère, rail fence, columnar, Playfair, stacked.
//   Coffee steam, dust in the window light, the desk lamp and time-of-day light move on their own.
// Live wallpaper: rest the pointer on a letter (or number) to light up every copy and count it.
// With reducedMotion one still frame is drawn (redrawn every 20 s).
// Test hooks: ?cipherDay=<n>&cipherMin=<minutes after midnight> pin the day and the time.

import imgUrl from './cipher-desk.jpg'

const START_KEY = 'ew.cipherDesk.start'
const FALLBACK_START = Math.floor(Date.UTC(2026, 10, 6) / 864e5)
const TEST = (() => { try { const q = new URLSearchParams(location.search); return { day: +q.get('cipherDay') || 0, min: q.get('cipherMin') != null ? +q.get('cipherMin') : null } } catch { return { day: 0, min: null } } })()
function dayNumber(d) {
  const today = Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 864e5)
  let start = FALLBACK_START
  try { const s = localStorage.getItem(START_KEY); if (s != null && !isNaN(+s)) start = +s; else { localStorage.setItem(START_KEY, String(today)); start = today } } catch { /* storage unavailable: count from release day */ }
  return Math.max(1, today - start + 1)
}

const LINES = [
 "THE QUIET HOURS KEEP THEIR OWN SECRETS","EVERY LOCKED DOOR WAS ONCE AN OPEN ROOM",
 "LISTEN TO THE RAIN BEFORE YOU ANSWER","SOME MAPS ARE DRAWN ONLY IN LANTERN LIGHT",
 "THE RIVER REMEMBERS EVERY STONE IT PASSED","A SLOW MORNING IS STILL A MORNING",
 "STARS DO NOT HURRY AND YET THEY ARRIVE","WRITE YOUR WISH ON THE BACK OF A LEAF",
 "THE KEY WAS UNDER THE BLUE TEACUP","MEET ME WHERE THE TRAIN TRACKS END",
 "PATIENCE IS A CIPHER WITH ONE LETTER","THE LIGHTHOUSE BLINKS TWICE FOR HELLO",
 "FOLD THE LETTER AND LET THE WIND READ IT","EVEN SILENCE HAS A GRAMMAR",
 "THE OWL KNOWS THE SECOND PASSWORD","BRING AN UMBRELLA AND A GOOD QUESTION",
 "THE GARDEN GATE OPENS AT MOONRISE","COUNT THE FIREFLIES THEN COUNT AGAIN",
 "THE MESSAGE IS HIDDEN IN PLAIN SIGHT","A PAPER BOAT CARRIES THE SMALLEST NEWS",
 "TOMORROW THE PUZZLE GROWS ONE STEP DEEPER","THE CLOCK TOWER HIDES A THIRTEENTH HOUR",
 "LEAVE THE WINDOW OPEN FOR THE MOTHS","HALF THE ANSWER IS ASKING WELL",
 "THE CAT ON THE ROOF IS THE MESSENGER","EVERY SHADOW POINTS TO THE SAME SUN",
 "THE LAST PAGE OF THE NOTEBOOK IS BLANK","WARM TEA SOLVES MOST CIPHERS",
 "THE BELLS RING IN ANOTHER LANGUAGE TONIGHT","LOOK FOR THE LIGHT UNDER THE STAIRS"];
const KEYS3=["OWL","TEA","INK","FOG","SKY","ASH","ELM","BAY"];
const KEYS4=["LAMP","MOON","RAIN","KITE","FERN","TIDE","MOTH","BELL"];
const KEYS6=["LANTERN","HARBOR","WILLOW","EMBERS","CANDLE","QUIVER","MEADOW","PEBBLES"];
const A="ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function rng(seed){let s=seed>>>0||1;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return((s>>>0)%100000)/100000}}
const pick=(r,a)=>a[Math.floor(r()*a.length)];
const letters=s=>s.replace(/[^A-Z]/g,"");
const groups=s=>letters(s).replace(/(.{5})/g,"$1 ").trim();
const shift=(c,k)=>A[(A.indexOf(c)+k+26)%26];
function caesar(p,k){return p.replace(/[A-Z]/g,c=>shift(c,k))}
function atbash(p){return p.replace(/[A-Z]/g,c=>A[25-A.indexOf(c)])}
function kwAlpha(k){let s="";for(const c of k+A)if(!s.includes(c))s+=c;return s}
function keyword(p,k){const al=kwAlpha(k);return p.replace(/[A-Z]/g,c=>al[A.indexOf(c)])}
function vigenere(p,k){let i=0;return letters(p).split("").map(c=>shift(c,A.indexOf(k[i++%k.length]))).join("")}
function rail(p,n){const t=letters(p),rows=Array.from({length:n},()=>"");let r=0,d=1;for(const c of t){rows[r]+=c;if(r===0)d=1;else if(r===n-1)d=-1;r+=d}return rows.join("")}
function columnar(p,k){const t=letters(p),n=k.length,cols=Array.from({length:n},()=>"");[...t].forEach((c,i)=>cols[i%n]+=c);
  const order=[...k].map((c,i)=>[c,i]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:a[1]-b[1]);return order.map(o=>cols[o[1]]).join("")}
function playfair(p,k){const sq=kwAlpha(k.replace(/J/g,"I")).replace("J","");const t=letters(p).replace(/J/g,"I");
  const prs=[];for(let i=0;i<t.length;){let a=t[i],b=t[i+1];if(!b||a===b){b="X";i++}else i+=2;prs.push([a,b])}
  const pos=c=>{const i=sq.indexOf(c);return[Math.floor(i/5),i%5]};
  return prs.map(([a,b])=>{const[ra,ca]=pos(a),[rb,cb]=pos(b);
    if(ra===rb)return sq[ra*5+(ca+1)%5]+sq[rb*5+(cb+1)%5];
    if(ca===cb)return sq[((ra+1)%5)*5+ca]+sq[((rb+1)%5)*5+cb];
    return sq[ra*5+cb]+sq[rb*5+ca]}).join("")}

/* The level plan: day number -> cipher. */
const KIDS=["MEET ME AT THE BIG OAK TREE","THE CAT HID THE RED SOCK","LOOK UNDER THE BLUE MAT",
 "THE CAKE IS IN THE BOX","SAY HELLO TO THE MOON","THE DOG ATE MY MAP","FIND THE GOLDEN KEY",
 "THE OWL CAN SEE YOU","THE TREASURE IS BY THE TREE","BRING TWO COOKIES"];
const ROWS=["QWERTYUIOP","ASDFGHJKL","ZXCVBNM"];
function keyboard(p){return p.replace(/[A-Z]/g,c=>{for(const r of ROWS){const i=r.indexOf(c);if(i>=0)return r[(i+1)%r.length]}return c})}
function a1z26(p){return p.split(" ").map(w=>[...w].map(c=>A.indexOf(c)+1).join("-")).join(" / ")}
/* The level plan: day number -> cipher. Levels 1-5 are beginner ciphers. */
const EASY=["THE KEY IS IN THE DRAWER","MEET AT THE RED BRIDGE","THE CLUE IS IN THE COAT","FOLLOW THE BLUE UMBRELLA",
 "CHECK THE THIRD PHOTO","THE BUTLER WAS ASLEEP","LOOK BEHIND THE CLOCK","THE LETTER CAME AT NOON","TRUST THE OLD MAP","THE SAFE OPENS AT DUSK"];
function puzzleFor(day){
  const r=rng(day*2654435761+97);
  const plain=day<=10?EASY[(day*3+1)%EASY.length]:LINES[(day*7+3)%LINES.length];
  const first=plain.split(" ")[0];let c,name,key="",level,numeric=false,kind,k,kw,n;
  if(day<=2){kind="caesar";k=1+Math.floor(r()*3);c=caesar(plain,k);name="Caesar shift";key="shift "+k;level=1}
  else if(day<=4){kind="atbash";c=atbash(plain);name="Atbash";key="flip the alphabet: A↔Z, B↔Y, C↔X";level=2}
  else if(day<=6){kind="number";c=a1z26(plain);numeric=true;name="Number code";key="A=1, B=2, C=3 … Z=26";level=3}
  else if(day<=8){kind="keyboard";c=keyboard(plain);name="Keyboard code";key="each letter is the key to its right on a keyboard";level=4}
  else if(day<=10){kind="caesarback";k=1+Math.floor(r()*3);c=caesar(plain,k).split(" ").map(w=>[...w].reverse().join("")).join(" ");
    name="Caesar shift + backwards words";key="shift "+k+", and each word is backwards";level=5}
  else if(day<=13){kind="caesargroups";k=1+Math.floor(r()*25);c=groups(caesar(plain,k));name="Caesar shift, spaces removed";key="shift "+k;level=6}
  else if(day<=16){kind="keyword";kw=pick(r,KEYS6);c=keyword(plain,kw);name="Keyword substitution";key=kw;level=7}
  else if(day<=21){kind="vigenere";kw=pick(r,day<=18?KEYS3:KEYS4);c=groups(vigenere(plain,kw));name="Vigenère";key=kw;level=8}
  else if(day<=24){kind="rail";n=day<=23?3:4;c=groups(rail(plain,n));name="Rail fence";key=n+" rails";level=9}
  else if(day<=27){kind="columnar";kw=pick(r,KEYS4);c=groups(columnar(plain,kw));name="Columnar transposition";key=kw;level=10}
  else if(day<=31){kind="vigenere";kw=pick(r,KEYS6);c=groups(vigenere(plain,kw));name="Vigenère";key=kw;level=11}
  else if(day<=36){kind="playfair";kw=pick(r,KEYS6);c=groups(playfair(plain,kw));name="Playfair";key=kw;level=12}
  else{kind="stack";kw=pick(r,KEYS4);c=groups(rail(vigenere(plain,kw),3));name="Vigenère, then rail fence";key=kw+" + 3 rails";level=13}
  return{day,plain,cipher:c,name,key,first,level,numeric,kind,k,kw,n};
}

/* How the answer was found: lines of {t, mono} shown under the answer at 18:00. */
function explain(z){
  const T=t=>({t}),M=t=>({t,mono:1});
  const pl=letters(z.plain),cl=letters(z.cipher),cw=z.cipher.split(" ")[0],pw=z.plain.split(" ")[0];
  const pairs=(c,p,nn)=>[...c].slice(0,nn).map((ch,i)=>ch+"→"+p[i]).join("  ")+(c.length>nn?"  …":"");
  switch(z.kind){
  case"caesar":return[T(`Move every letter back ${z.k} in the alphabet (after A comes Z again).`),M(pairs(cw,pw,6)),M(`${cw} → ${pw}`)];
  case"atbash":return[T("Swap each letter with its mirror in the alphabet:"),M("A B C D E F G H I J K L M"),M("Z Y X W V U T S R Q P O N"),M(`${cw} → ${pw}`)];
  case"number":return[T("Each number is the letter's place in the alphabet; / is a gap between words."),
    M(cw.split("-").map((x,i)=>x+"→"+pw[i]).join("  ")),M(`${cw} → ${pw}`)];
  case"keyboard":return[T("Every letter was moved one key to the right, so take the key to its left:"),
    M("Q W E R T Y U I O P"),M(" A S D F G H J K L"),M("  Z X C V B N M"),M(`${cw} → ${pw}`)];
  case"caesarback":{const rev=[...cw].reverse().join("");return[T("1. Read each word backwards:"),M(`${cw} → ${rev}`),
    T(`2. Move each letter back ${z.k}:`),M(`${rev} → ${pw}`)]}
  case"caesargroups":return[T(`Move every letter back ${z.k}, then put the spaces back between the words.`),
    M(pairs(cl,pl,7)),M(`${cl.slice(0,12)}… → ${pl.slice(0,12)}…`)];
  case"keyword":{const al=kwAlpha(z.kw);return[T(`The cipher alphabet starts with ${z.kw}, then the unused letters follow.`),
    M("Plain  "+A),M("Cipher "+al),T("Find each letter in the Cipher row and read the letter above it.")]}
  case"vigenere":{const ks=Array.from({length:14},(_,i)=>z.kw[i%z.kw.length]).join("");return[T(`Write ${z.kw} under the message again and again, then move each letter back by its key letter (A=0, B=1, C=2 …).`),
    M("Cipher "+cl.slice(0,14)),M("Key    "+ks),M("Plain  "+pl.slice(0,14))]}
  case"rail":{const nn=z.n,len=Math.min(16,pl.length),rows=Array.from({length:nn},()=>Array(len).fill("·"));let r=0,d=1;
    for(let i=0;i<len;i++){rows[r][i]=pl[i];if(r===0)d=1;else if(r===nn-1)d=-1;r+=d}
    return[T(`The message was written in a zigzag on ${nn} rails, then read row by row. Split the cipher into the rows and follow the zigzag:`),...rows.map(x=>M(x.join(" ")))]}
  case"columnar":{const kk=z.kw,ord=[...kk].map((c,i)=>[c,i]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:a[1]-b[1]);const rank=Array(kk.length);ord.forEach((o,j)=>rank[o[1]]=j+1);
    const rows=[];for(let i=0;i<Math.min(12,pl.length);i+=kk.length)rows.push(M(pl.slice(i,i+kk.length).split("").join(" ")));
    return[T(`The message was written in rows under ${kk}, then read down the columns in the order 1, 2, 3 …:`),M([...kk].join(" ")),M(rank.join(" ")),...rows,M("…")]}
  case"playfair":{const sq=kwAlpha(z.kw.replace(/J/g,"I")).replace("J","");const rows=[0,1,2,3,4].map(i=>M(sq.slice(i*5,i*5+5).split("").join(" ")));
    return[T(`Build a 5×5 square from ${z.kw} (I and J share a box). Undo the letters two at a time:`),...rows,
      T("Same row: take the letter on the left. Same column: the one above. Otherwise swap the corners of their rectangle.")]}
  default:return[T("1. Undo the rail fence (3 rails) to get the Vigenère text."),T(`2. Move each letter back by the key ${z.kw} repeated (A=0, B=1 …).`),
    M("Key    "+Array.from({length:14},(_,i)=>z.kw[i%z.kw.length]).join("")),M("Plain  "+pl.slice(0,14))];
  }
}

export function mount(container,ctx){
  const W=1920,H=1080;
  const base=document.createElement("canvas"),fx=document.createElement("canvas");
  base.width=fx.width=W;base.height=fx.height=H;
  for(const cv of [base,fx])cv.style.cssText="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;";
  container.replaceChildren(base,fx);
  const b=base.getContext("2d"),f=fx.getContext("2d");
  const img=new Image();
  // paper corners in picture pixels
  const TL=[656,531],TR=[1264,531],BR=[1420,976],BL=[490,976];
  const SW=820,SH=560;const paper=document.createElement("canvas");paper.width=SW;paper.height=SH;const p=paper.getContext("2d");
  let state={day:0,min:0},puz=null,cells=[],hover=null,reveal={start:0,done:false,key:""},tod=ctx.timeOfDay||"day";
  let raf=0,alive=true,lastKey="";
  const mono='"Courier New",Courier,monospace',serif='Georgia,"Times New Roman",serif';

  const clock=()=>{const d=new Date();return{day:TEST.day||dayNumber(d),min:TEST.min!=null?TEST.min:d.getHours()*60+d.getMinutes()+d.getSeconds()/60}};

  /* ---- paper content ---- */
  function layoutCipher(text,size,small){
    p.font=`bold ${size}px ${mono}`;const cw=p.measureText("M").width,lh=size*1.5,maxW=SW-150;
    const words=text.split(" ");const lines=[[]];let w=0;
    for(const wd of words){const ww=(wd.length+1)*cw;if(w+ww>maxW&&lines[lines.length-1].length){lines.push([]);w=0}lines[lines.length-1].push(wd);w+=ww}
    const out=[],deco=[];lines.forEach((ln,li)=>{const s=ln.join(" ");const x0=(SW-s.length*cw)/2,y=(small?118:135)+li*lh;
      for(let i=0;i<s.length;){const ch=s[i];
        if(/[0-9]/.test(ch)){let j=i;while(j<s.length&&/[0-9]/.test(s[j]))j++;out.push({ch:s.slice(i,j),x:x0+i*cw,y,w:(j-i)*cw,h:size});i=j}
        else if(/[A-Z]/.test(ch)){out.push({ch,x:x0+i*cw,y,w:cw,h:size});i++}
        else{if(ch!==" ")deco.push({ch,x:x0+i*cw,y});i++}}});
    out.deco=deco;return out;
  }
  function drawPaper(now){
    p.clearRect(0,0,SW,SH);
    const m=state.min,day=state.day;
    if(m<540&&day<=1){cells=Object.assign([],{deco:[]});p.font=`italic 26px ${serif}`;p.fillStyle="rgba(60,44,28,.8)";p.textAlign="center";p.fillText("Your first case arrives at 09:00.",SW/2,SH/2);p.textAlign="left";return false}
    const before=m<540;const shown=before?puzzleFor(Math.max(1,day-1)):puz;
    const solved=before||m>=1080;
    // header
    p.fillStyle="rgba(60,44,28,.85)";p.font=`italic 22px ${serif}`;p.textAlign="left";
    p.fillText(`Case No. ${shown.day}`,70,60);
    p.textAlign="right";p.fillText("Level "+shown.level,SW-70,60);
    p.textAlign="left";
    p.fillStyle="rgba(60,44,28,.35)";p.fillRect(70,74,SW-140,1.2);
    // cipher text
    const size=solved?(shown.numeric?20:24):shown.numeric?30:shown.cipher.length>30?36:42;
    cells=layoutCipher(shown.cipher,size,solved);
    const counts={};for(const c of cells)counts[c.ch]=(counts[c.ch]||0)+1;
    p.font=`bold ${size}px ${mono}`;
    for(const c of cells){
      const hot=hover&&!solved&&c.ch===hover;
      if(hot){p.fillStyle="rgba(214,150,50,.38)";p.fillRect(c.x-2,c.y-c.h*.82,c.w+4,c.h*1.05)}
      p.fillStyle=solved?"rgba(43,33,23,.45)":"rgba(43,33,23,.92)";p.fillText(c.ch,c.x,c.y);
    }
    p.fillStyle=solved?"rgba(43,33,23,.3)":"rgba(43,33,23,.55)";for(const d of cells.deco)p.fillText(d.ch,d.x,d.y);
    const lastY=cells.length?cells[cells.length-1].y:135;
    // hover count tag
    if(hover&&!solved&&counts[hover]){p.font=`italic 22px ${serif}`;p.fillStyle="rgba(150,90,20,.95)";p.textAlign="center";
      p.fillText(`${hover} appears ${counts[hover]}× in ${cells.length} ${shown.numeric?"numbers":"letters"}`,SW/2,lastY+42);p.textAlign="left"}
    // hints (pencil)
    const hints=[];
    if(!before){
      if(m>=720)hints.push(["12:00","key: "+shown.key]);
      if(m>=900)hints.push(["15:00",shown.name]);
      if(m>=1020)hints.push(["17:00","first word: "+shown.first]);
    }else hints.push(["",`Yesterday's cipher. A new one arrives at 09:00.`]);
    p.font=`italic 23px ${serif}`;p.fillStyle="rgba(60,62,78,.85)";
    let hy=SH-45-(hints.length-1)*32;
    if(solved)hy=SH-26;
    if(!solved)hints.forEach((h,i)=>{p.fillText((h[0]?h[0]+"  ·  ":"")+h[1],70,hy+i*32)});
    else if(before){p.fillText(hints[0][1],70,hy)}
    else{p.fillText(`${shown.name}  ·  key: ${shown.key}`,70,hy)}
    // deciphered line (pen), written letter by letter, then "how it was solved"
    if(solved){
      let prog=1,fade=1;
      const wt=Math.max(2.5,shown.plain.length*.09);
      if(!before&&!ctx.reducedMotion){const el=(now-reveal.start)/1000;prog=Math.min(1,el/wt);fade=Math.max(0,Math.min(1,(el-wt)/1.5))}
      const txt=shown.plain.slice(0,Math.ceil(shown.plain.length*prog));
      p.font=`italic 600 ${shown.plain.length>26?32:36}px ${serif}`;p.fillStyle="rgba(28,52,104,.95)";p.textAlign="center";
      let y=lastY+58;
      const maxW=SW-150;if(p.measureText(shown.plain).width>maxW){const ws=txt.split(" ");const half=Math.ceil(shown.plain.split(" ").length/2);
        p.fillText(ws.slice(0,half).join(" "),SW/2,y);p.fillText(ws.slice(half).join(" "),SW/2,y+38);y+=38}
      else p.fillText(txt,SW/2,y);
      p.textAlign="left";
      if(fade>0){
        p.globalAlpha=fade;y+=46;
        p.font=`600 15px ${serif}`;p.fillStyle="rgba(60,44,28,.7)";p.fillText("HOW IT WAS SOLVED",70,y);y+=8;
        p.fillStyle="rgba(60,44,28,.25)";p.fillRect(70,y,SW-140,1);y+=26;
        for(const ln of explain(shown)){
          if(ln.mono){p.font=`bold 19px ${mono}`;p.fillStyle="rgba(28,52,104,.85)";p.fillText(ln.t,90,y);y+=24}
          else{p.font=`italic 19px ${serif}`;p.fillStyle="rgba(50,44,40,.9)";
            const words=ln.t.split(" ");let line="";for(const w of words){const tt=line?line+" "+w:w;if(p.measureText(tt).width>SW-150&&line){p.fillText(line,70,y);y+=23;line=w}else line=tt}
            p.fillText(line,70,y);y+=27}
        }
        p.globalAlpha=1;
      }
      return prog<1||fade<1;
    }
    return false;
  }

  /* ---- composite picture + grade + warped paper ---- */
  const GRADE={dawn:null,day:["rgba(255,250,240,.07)","screen"],dusk:["rgba(255,140,60,.18)","multiply"],night:["rgba(26,34,72,.86)","multiply"]};
  function rowAt(v){return{xl:TL[0]+(BL[0]-TL[0])*v,xr:TR[0]+(BR[0]-TR[0])*v,y:(TL[1]+TR[1])/2+(((BL[1]+BR[1])/2)-((TL[1]+TR[1])/2))*v}}
  function drawBase(now){
    if(!img.complete)return false;
    b.globalCompositeOperation="source-over";b.drawImage(img,0,0,W,H);
    const g=GRADE[tod];if(g){b.globalCompositeOperation=g[1];b.fillStyle=g[0];b.fillRect(0,0,W,H)}
    if(tod==="night"||tod==="dusk"){ // lamp pool
      b.globalCompositeOperation="lighter";const r=b.createRadialGradient(230,230,20,600,650,950);
      const a=tod==="night"?.5:.14;r.addColorStop(0,`rgba(255,190,110,${a})`);r.addColorStop(1,"rgba(255,190,110,0)");b.fillStyle=r;b.fillRect(0,0,W,H)}
    b.globalCompositeOperation="source-over";
    const more=drawPaper(now);
    b.globalCompositeOperation="multiply";
    const step=2;for(let sy=0;sy<SH;sy+=step){const r0=rowAt(sy/SH),r1=rowAt((sy+step)/SH);
      b.drawImage(paper,0,sy,SW,step,r0.xl,r0.y,r0.xr-r0.xl,r1.y-r0.y+.6)}
    b.globalCompositeOperation="source-over";
    return more;
  }

  /* ---- ambient fx: tea steam, dust motes in window light, lamp flicker ---- */
  const motes=Array.from({length:40},()=>({x:440+Math.random()*620,y:30+Math.random()*480,s:.6+Math.random()*1.6,ph:Math.random()*6.28}));
  function drawFx(t){
    f.clearRect(0,0,W,H);if(ctx.reducedMotion)return;
    // steam
    for(let i=0;i<3;i++){const k=((t/5200+i/3)%1);const x=1640+Math.sin(t/900+i*2)*8*k+(i-1)*8,y=520-k*150;
      f.fillStyle=`rgba(255,250,240,${.10*(1-k)*Math.min(1,k*5)})`;f.beginPath();f.ellipse(x,y,10+k*22,16+k*26,0,0,6.28);f.fill()}
    // motes
    const ma=tod==="night"?.15:tod==="dusk"?.45:.65;
    for(const m of motes){m.y-=.08;m.x+=Math.sin(t/3000+m.ph)*.12;if(m.y<30)m.y=510;
      f.fillStyle=`rgba(255,235,190,${ma*(.35+.35*Math.sin(t/1400+m.ph))})`;f.fillRect(m.x,m.y,m.s,m.s)}
    // lamp
    if(tod!=="day"){const fl=.85+.15*Math.sin(t/430)*Math.sin(t/170);const g=f.createRadialGradient(222,212,4,222,212,130);
      g.addColorStop(0,`rgba(255,210,140,${.35*fl})`);g.addColorStop(1,"rgba(255,210,140,0)");f.fillStyle=g;f.fillRect(80,80,300,280)}
  }

  /* ---- clock + loop ---- */
  function tick(now){
    if(!alive)return;
    const c=clock();const nd=c.day,nm=c.min;
    const ntod=ctx.timeOfDay||"day";
    if(nd!==state.day){puz=puzzleFor(nd);reveal.done=false}
    // detect crossing 18:00 -> start the pen writing now
    if(nm>=1080&&!(state.min>=1080&&state.day===nd)){reveal.start=now}
    state={day:nd,min:nm};tod=ntod;
    const key=`${nd}|${Math.floor(nm)}|${tod}|${hover}`;
    if(key!==lastKey||writing){writing=drawBase(now);lastKey=key}
    drawFx(now);
    raf=requestAnimationFrame(tick);
  }
  let writing=false;

  // pointer: CSS px -> picture px (object-fit: cover) -> paper px
  function toPic(x,y){const r=container.getBoundingClientRect();const s=Math.max(r.width/W,r.height/H);
    return[(x-(r.width-W*s)/2)/s,(y-(r.height-H*s)/2)/s]}
  function toPaper(px,py){const v=(py-(TL[1]+TR[1])/2)/(((BL[1]+BR[1])/2)-((TL[1]+TR[1])/2));if(v<0||v>1)return null;
    const r=rowAt(v);const u=(px-r.xl)/(r.xr-r.xl);if(u<0||u>1)return null;return[u*SW,v*SH]}
  const off=ctx.onPointer?.(({x,y})=>{
    const[px,py]=toPic(x,y);const q=toPaper(px,py);let h=null;
    if(q)for(const c of cells){if(q[0]>=c.x-3&&q[0]<=c.x+c.w+3&&q[1]>=c.y-c.h*.85&&q[1]<=c.y+c.h*.25){h=c.ch;break}}
    hover=h;
  });
  const unsub=ctx.subscribe?.(({timeOfDay})=>{tod=timeOfDay;lastKey=""});

  let iv=0;
  img.onload=()=>{if(!alive)return;const c=clock();state={day:c.day,min:c.min};puz=puzzleFor(c.day);tod=ctx.timeOfDay||"day";reveal.start=performance.now()-1e5;
    drawBase(performance.now());drawFx(0);requestAnimationFrame(()=>requestAnimationFrame(()=>ctx.ready()));
    if(!ctx.reducedMotion)raf=requestAnimationFrame(tick);
    else iv=setInterval(()=>{const c=clock();state={day:c.day,min:c.min};puz=puzzleFor(c.day);tod=ctx.timeOfDay||"day";drawBase(performance.now()+1e6)},20000)};
  img.onerror=()=>{console.error("cipher-desk: picture failed to load");ctx.ready()};
  img.src=imgUrl;

  return{unmount(){alive=false;cancelAnimationFrame(raf);clearInterval(iv);off?.();unsub?.();base.remove();fx.remove()}};
}
