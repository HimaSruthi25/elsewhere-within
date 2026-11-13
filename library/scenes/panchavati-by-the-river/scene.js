// Panchavati by the River — Rama, Sita and Lakshmana at rest by their forest
// hut on the Godavari (Ramayana). Hima's idea, from a reference picture she sent.
// The base is a silent 18 s looping video (panchavati-by-the-river.mp4) made
// from the scene picture: the three breathe, blink and turn their heads, Sita
// strings a jasmine garland, the river flows, the deer drink, leaves fall.
// A 2D canvas draws the video and, on top of it, in code:
//   - the light of the day by the PC clock (the video itself is golden hour):
//     cool dawn with river mist, day as filmed, deeper dusk, blue night with
//     stars, a moon where the sun was, fireflies and the lamp glowing by the hut;
//   - sun rays, bird flocks (hidden behind the trees by the sky mask), an egret
//     gliding up the river, butterflies by day, a fish rising now and then.
// Live wallpaper (hover only): move over the river and ripples follow the hand;
// rest on the water for a wider ring; rest on the bank and flower petals drift down.
// With reducedMotion the still picture is drawn once (again when the time of
// day changes) and the video is never loaded. If the video cannot play, the
// still picture stays.
// Masks (960×540, made from the picture, alpha only): -water.png = river,
// -sky.png = open sky.
import videoUrl from './panchavati-by-the-river.mp4'
import pictureUrl from './panchavati-by-the-river.jpg'
import waterUrl from './panchavati-by-the-river-water.png'
import skyUrl from './panchavati-by-the-river-sky.png'

const HOURS = { dawn: 6, day: 12, dusk: 17.8, night: 22 }

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = () => reject(new Error(`panchavati-by-the-river: ${src} failed to load`))
    im.src = src
  })
}

export function mount(container, ctx) {
  const W=1920,H=1080,TAU=Math.PI*2;
  const SUN={x:494,y:360},LAMP={x:1757,y:660};
  const cv=document.createElement('canvas'),g=cv.getContext('2d');
  cv.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';container.replaceChildren(cv);
  const fx=document.createElement('canvas');fx.width=960;fx.height=540;const fg=fx.getContext('2d');
  const sk=document.createElement('canvas');sk.width=960;sk.height=540;const sg=sk.getContext('2d');
  let alive=true,raf=0,imgs={},waterData=null,view={s:1,ox:0,oy:0};
  const rnd=(a,b)=>a+Math.random()*(b-a);
  let seed=7;const srnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647};

  // time of day: one set of numbers per hour of the day, blended
  const K=[
   [0,   {mul:[28,42,96],a:.80,night:1,gl:[190,210,255],ga:.45,rays:0,  mist:.3,birds:0, flies:1, lamp:1, bfly:0}],
   [4.8, {mul:[28,42,96],a:.80,night:1,gl:[190,210,255],ga:.45,rays:0,  mist:.5,birds:0, flies:.8,lamp:1, bfly:0}],
   [6,   {mul:[188,200,236],a:.40,night:0,gl:[255,232,226],ga:.5,rays:.5,mist:1, birds:1, flies:0, lamp:.3,bfly:0}],
   [8.5, {mul:[255,255,255],a:0,  night:0,gl:[255,250,235],ga:.55,rays:.3,mist:0, birds:.4,flies:0, lamp:0, bfly:1}],
   [16,  {mul:[255,255,255],a:0,  night:0,gl:[255,250,235],ga:.55,rays:.3,mist:0, birds:.4,flies:0, lamp:0, bfly:1}],
   [17.8,{mul:[255,186,146],a:.24,night:0,gl:[255,214,160],ga:.7,rays:.8,mist:0, birds:1, flies:.3,lamp:.8,bfly:.2}],
   [19.3,{mul:[28,42,96],a:.80,night:1,gl:[190,210,255],ga:.45,rays:0,  mist:.3,birds:0, flies:1, lamp:1, bfly:0}],
   [24,  {mul:[28,42,96],a:.80,night:1,gl:[190,210,255],ga:.45,rays:0,  mist:.3,birds:0, flies:1, lamp:1, bfly:0}]];
  let tod=ctx.timeOfDay in HOURS?ctx.timeOfDay:'day';
  function at(h){
    let i=0;while(i<K.length-2&&h>=K[i+1][0])i++;
    const A=K[i],B=K[i+1],u=Math.min(1,Math.max(0,(h-A[0])/(B[0]-A[0]))),o={};
    for(const k in A[1]){const a=A[1][k],b=B[1][k];o[k]=Array.isArray(a)?a.map((v,n)=>v+(b[n]-v)*u):a+(b-a)*u}
    return o;
  }
  // the light eases to the new time of day over about half a minute
  let cur=null;
  function params(dt){
    const tg=at(HOURS[tod]);
    if(!cur||!dt||ctx.reducedMotion){cur=tg;return cur}
    const k=1-Math.exp(-dt/10);
    for(const n in tg){const a=cur[n],b=tg[n];cur[n]=Array.isArray(b)?b.map((v,q)=>a[q]+(v-a[q])*k):a+(b-a)*k}
    return cur;
  }

  /* things that live in the scene */
  const glints=[];for(let i=0;i<230;i++)glints.push({x:srnd()*820,y:602+srnd()*478,ph:srnd()*TAU,sp:.5+srnd()*1.3});
  const sunGl=[];for(let i=0;i<90;i++)sunGl.push({o:srnd()*2-1,y:606+srnd()*400,ph:srnd()*TAU,sp:1+srnd()*2});
  const stars=[];for(let i=0;i<170;i++)stars.push({x:srnd()*900,y:srnd()*400,r:.5+srnd()*1.1,ph:srnd()*TAU,sp:.4+srnd()*1.2});
  const flies=[];for(let i=0;i<42;i++)flies.push({x:540+srnd()*1360,y:520+srnd()*520,ph:srnd()*TAU,sp:.5+srnd()*.9,a:srnd()*TAU,v:8+srnd()*12});
  const bfly=[];const BF=[[850,540],[1010,1020],[1830,500],[1880,830],[150,880]],BC=['#f6d24a','#fff4dc','#f29b3a','#fff4dc','#f6c0d8'];
  for(let i=0;i<5;i++)bfly.push({cx:BF[i][0],cy:BF[i][1],ph:srnd()*TAU,c:BC[i]});
  const mists=[];for(let i=0;i<7;i++)mists.push({x:srnd()*900,y:610+srnd()*120,r:200+srnd()*180,v:5+srnd()*8});
  let ripples=[],petals=[],flocks=[],egret=null;
  let nextFish=6,nextFlock=5,nextEgret=18;

  const onWater=(x,y)=>{if(!waterData||x<0||y<0||x>=W||y>=H)return false;return waterData[((y>>1)*960+(x>>1))*4+3]>110};
  function ripple(x,y,size){ripples.push({x,y,t:0,size});if(ripples.length>60)ripples.shift()}
  function fishRise(){for(let i=0;i<40;i++){const x=rnd(30,700),y=rnd(700,870);if(onWater(x|0,y|0)){ripple(x,y,1.2);return}}}
  function petal(x,y,ground){petals.push({x,y,ground,t:rnd(0,9),r:rnd(0,TAU),vr:rnd(-1.4,1.4),vy:rnd(16,30),sz:rnd(3.5,6),c:['#fff2e6','#ffc9d6','#ffb23f','#fff8f0'][Math.random()*4|0],life:1})}
  function shower(x,y){for(let i=0;i<30;i++)petal(x+rnd(-140,140),y-rnd(150,420),y+rnd(-18,26))}

  /* pointer: hover the river = ripples; rest on the bank = petals */
  const ptr={x:-1,y:-1,lx:0,ly:0,still:0,inside:false,fired:false,cool:0};
  const offPtr=ctx.onPointer?ctx.onPointer(e=>{
    if(e.type!=='move')return;
    const x=(e.x-view.ox)/view.s,y=(e.y-view.oy)/view.s;
    if(Math.hypot(x-ptr.x,y-ptr.y)>6){ptr.still=0;ptr.fired=false}
    ptr.x=x;ptr.y=y;ptr.inside=true;
    if(onWater(x|0,y|0)&&Math.hypot(x-ptr.lx,y-ptr.ly)>46){ripple(x,y,.55);ptr.lx=x;ptr.ly=y}
  }):null;

  function fit(){
    const r=container.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);
    let pw=Math.round(r.width*dpr),ph=Math.round(r.height*dpr);
    const cap=Math.min(1,2560/Math.max(pw,1));pw=Math.round(pw*cap);ph=Math.round(ph*cap);
    if(cv.width!==pw||cv.height!==ph){cv.width=pw;cv.height=ph}
    const s=Math.max(pw/W,ph/H);view.ps=s;view.pox=(pw-W*s)/2;view.poy=(ph-H*s)*.62;
    const cs=Math.max(r.width/W,r.height/H);view.s=cs;view.ox=(r.width-W*cs)/2;view.oy=(r.height-H*cs)*.62;
  }
  const ro=new ResizeObserver(fit);ro.observe(container);

  function drawWater(t,P){
    fg.setTransform(.5,0,0,.5,0,0);fg.globalCompositeOperation='source-over';fg.clearRect(0,0,W,H);
    const c=P.gl,col=`rgb(${c[0]|0},${c[1]|0},${c[2]|0})`;fg.strokeStyle=col;fg.fillStyle=col;fg.lineCap='round';
    for(const q of glints){
      const k=(q.y-600)/480,a=Math.max(0,Math.sin(t*q.sp+q.ph));if(a<.25)continue;
      let x=(q.x-t*(5+k*16))%820;if(x<0)x+=820;const len=6+k*46;
      fg.globalAlpha=a*a*a*P.ga*.55*(.2+.8*P.night);fg.lineWidth=1.2+k*1.8;fg.beginPath();fg.moveTo(x,q.y);fg.lineTo(x+len,q.y);fg.stroke();
    }
    for(const q of sunGl){
      const k=(q.y-600)/480,a=Math.max(0,Math.sin(t*q.sp+q.ph));if(a<.3)continue;
      const x=SUN.x+q.o*(16+k*70),len=5+k*26;
      fg.globalAlpha=a*a*Math.min(1,P.ga+.25)*.8*(.15+.85*P.night);fg.lineWidth=1.4+k*2;fg.beginPath();fg.moveTo(x-len/2,q.y);fg.lineTo(x+len/2,q.y);fg.stroke();
    }
    for(const r of ripples){
      const k=Math.max(.15,(r.y-600)/480),life=1-r.t/3.6;if(life<=0)continue;
      for(let j=0;j<2;j++){
        const rad=(r.t-j*.5)*62*(.35+k)*r.size;if(rad<=0)continue;
        fg.globalAlpha=life*life*.6;fg.lineWidth=1.4+k*1.6;fg.beginPath();fg.ellipse(r.x,r.y,rad,rad*.3,0,0,TAU);fg.stroke();
      }
    }
    fg.globalAlpha=1;fg.setTransform(1,0,0,1,0,0);fg.globalCompositeOperation='destination-in';fg.drawImage(imgs.water,0,0);
  }
  function drawSky(t,P){
    sg.setTransform(.5,0,0,.5,0,0);sg.globalCompositeOperation='source-over';sg.clearRect(0,0,W,H);
    if(P.night>.02){sg.fillStyle='#f4f6ff';for(const s of stars){sg.globalAlpha=P.night*(.45+.55*Math.sin(t*s.sp+s.ph));if(sg.globalAlpha<=0)continue;sg.beginPath();sg.arc(s.x,s.y,s.r,0,TAU);sg.fill()}}
    sg.lineCap='round';
    for(const f of flocks)for(const b of f.b){
      const x=f.x+b.dx,y=f.y+b.dy+Math.sin(t*.7+b.ph)*4,w=b.sz,fl=Math.sin(t*b.fr+b.ph)*w*.55;
      sg.globalAlpha=.7*f.fade;sg.strokeStyle='#33262e';sg.lineWidth=1.5;
      sg.beginPath();sg.moveTo(x-w,y-fl);sg.quadraticCurveTo(x-w*.4,y-w*.25,x,y);sg.quadraticCurveTo(x+w*.4,y-w*.25,x+w,y-fl);sg.stroke();
    }
    sg.globalAlpha=1;sg.setTransform(1,0,0,1,0,0);sg.globalCompositeOperation='destination-in';sg.drawImage(imgs.sky,0,0);
  }
  function glow(x,y,r,col,a){const gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,col);gr.addColorStop(1,'rgba(0,0,0,0)');g.globalAlpha=a;g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2)}

  /* the moving painting: a silent looping video under everything else */
  let vid=null,vidUrl=null;
  function startVideo(){
    if(ctx.reducedMotion)return;
    fetch(videoUrl).then(r=>r.blob()).then(b=>{
      if(!alive)return;vidUrl=URL.createObjectURL(b);
      const v=document.createElement('video');v.muted=true;v.loop=true;v.playsInline=true;v.preload='auto';v.src=vidUrl;
      v.addEventListener('error',()=>{vid=null});
      const p=v.play();if(p&&p.catch)p.catch(()=>{});vid=v;
    }).catch(()=>{});
  }
  let last=0,T=0;
  function step(dt,P){
    T+=dt;
    for(const r of ripples)r.t+=dt;ripples=ripples.filter(r=>r.t<3.6);
    if((nextFish-=dt)<0){fishRise();nextFish=rnd(11,24)}
    for(const p of petals){p.t+=dt;p.y+=p.vy*dt;p.x+=Math.sin(p.t*1.3)*18*dt-6*dt;p.r+=p.vr*dt;if(p.y>p.ground)p.life-=dt*.9}
    petals=petals.filter(p=>p.life>0);
    if(P.birds>.05&&(nextFlock-=dt*P.birds)<0){
      const dir=Math.random()<.5?1:-1,n=5+(Math.random()*5|0),b=[];
      for(let i=0;i<n;i++){const side=i%2?1:-1,row=Math.ceil(i/2);b.push({dx:-dir*row*17+rnd(-4,4),dy:side*row*8+rnd(-3,3),sz:rnd(5,8),fr:rnd(5,7),ph:rnd(0,TAU)})}
      flocks.push({x:dir>0?-120:1000,y:rnd(70,230),vx:dir*rnd(26,38),vy:rnd(-3,2),b,fade:1});nextFlock=rnd(26,50)}
    for(const f of flocks){f.x+=f.vx*dt;f.y+=f.vy*dt}flocks=flocks.filter(f=>f.x>-200&&f.x<1150);
    if(!egret&&P.night<.3&&(nextEgret-=dt)<0){egret={u:0};nextEgret=rnd(60,110)}
    if(egret){egret.u+=dt/34;if(egret.u>=1)egret=null}
    for(const f of flies){f.a+=rnd(-1,1)*dt*2;f.x+=Math.cos(f.a)*f.v*dt;f.y+=Math.sin(f.a)*f.v*dt*.6;if(f.x<520)f.a=0;if(f.x>1910)f.a=Math.PI;if(f.y<500)f.a=1.2;if(f.y>1050)f.a=-1.2}
    for(const m of mists){m.x+=m.v*dt;if(m.x-m.r>900)m.x=-m.r}
    ptr.cool-=dt;
    if(ptr.inside){ptr.still+=dt;if(ptr.still>.8&&!ptr.fired){ptr.fired=true;
      if(onWater(ptr.x|0,ptr.y|0)){ripple(ptr.x,ptr.y,1.3)}else if(ptr.cool<=0){shower(ptr.x,Math.max(ptr.y,420));ptr.cool=3.5}}}
  }
  function draw(P){
    const t=T;
    g.globalCompositeOperation='source-over';g.globalAlpha=1;
    g.setTransform(view.ps,0,0,view.ps,view.pox,view.poy);
    g.drawImage(vid&&vid.readyState>=2?vid:imgs.pic,0,0,W,H);
    if(P.a>.01){g.globalCompositeOperation='multiply';g.globalAlpha=P.a;g.fillStyle=`rgb(${P.mul[0]|0},${P.mul[1]|0},${P.mul[2]|0})`;g.fillRect(0,0,W,H)}
    drawSky(t,P);g.globalAlpha=1;g.globalCompositeOperation='source-over';g.drawImage(sk,0,0,W,H);
    g.globalCompositeOperation='lighter';
    if(P.night>.02){glow(SUN.x,SUN.y,34,'rgba(235,240,255,1)',P.night*.9);glow(SUN.x,SUN.y,260,'rgba(120,150,230,.6)',P.night*.5)}
    if(P.rays>.02){
      g.save();g.translate(SUN.x,SUN.y);
      for(let i=0;i<9;i++){
        const a=-0.25+i*.2+Math.sin(t*.05+i)*.05,w=.035+.02*Math.sin(t*.11+i*2.1),len=1500;
        const gr=g.createLinearGradient(0,0,Math.cos(a)*len,Math.sin(a)*len);gr.addColorStop(0,'rgba(255,214,150,.5)');gr.addColorStop(1,'rgba(255,214,150,0)');
        g.globalAlpha=P.rays*(.10+.06*Math.sin(t*.17+i*1.7));g.fillStyle=gr;g.beginPath();g.moveTo(0,0);g.lineTo(Math.cos(a-w)*len,Math.sin(a-w)*len);g.lineTo(Math.cos(a+w)*len,Math.sin(a+w)*len);g.fill();
      }g.restore();
    }
    drawWater(t,P);g.globalAlpha=1;g.drawImage(fx,0,0,W,H);
    if(P.mist>.02){g.globalCompositeOperation='screen';for(const m of mists)glow(m.x,m.y,m.r,'rgba(225,230,240,.5)',P.mist*.3)}
    g.globalCompositeOperation='lighter';
    if(P.lamp>.02){
      const fl=.8+.12*Math.sin(t*9.1)+.08*Math.sin(t*14.7+1);
      glow(1890,430,210,'rgba(255,170,80,.55)',P.lamp*.3*fl);
      glow(LAMP.x,LAMP.y,190,'rgba(255,178,84,.7)',P.lamp*.6*fl);glow(LAMP.x,LAMP.y,30,'rgba(255,226,160,1)',P.lamp*.8*fl);
    }
    if(P.flies>.02)for(const f of flies){const b=Math.max(0,Math.sin(t*f.sp*2+f.ph));if(b<.05)continue;glow(f.x,f.y,9,'rgba(214,255,120,1)',b*P.flies*.9)}
    g.globalCompositeOperation='source-over';
    const dim=1-P.night*.55;
    for(const p of petals){
      g.save();g.translate(p.x,p.y);g.rotate(p.r);g.globalAlpha=Math.min(1,p.life)*.9*dim;g.fillStyle=p.c;
      g.beginPath();g.ellipse(0,0,p.sz,p.sz*(.25+.2*Math.abs(Math.sin(p.t*2))),0,0,TAU);g.fill();g.restore();
    }
    if(P.bfly>.02)for(const b of bfly){
      const x=b.cx+Math.sin(t*.31+b.ph)*70+Math.sin(t*.9+b.ph*2)*14,y=b.cy+Math.sin(t*.47+b.ph*1.7)*34+Math.sin(t*1.7+b.ph)*6,fl=Math.abs(Math.sin(t*11+b.ph));
      g.globalAlpha=P.bfly*.95;g.fillStyle=b.c;
      g.beginPath();g.ellipse(x-3*fl-1,y,4.2*fl+.6,4.6,-.4,0,TAU);g.ellipse(x+3*fl+1,y,4.2*fl+.6,4.6,.4,0,TAU);g.fill();
    }
    if(egret){
      const u=egret.u,x=-60+u*680,y=646-u*44+Math.sin(u*20)*4,s=1.25-u*.9,fl=Math.sin(t*4.2);
      g.save();g.translate(x,y);g.scale(s,s);g.globalAlpha=Math.min(1,u*8,(1-u)*5)*dim;g.strokeStyle='#fbf6ea';g.fillStyle='#fbf6ea';g.lineCap='round';
      g.lineWidth=4;g.beginPath();g.moveTo(-14,2);g.lineTo(13,-1);g.stroke();
      g.lineWidth=2;g.beginPath();g.moveTo(13,-1);g.lineTo(21,-5);g.stroke();g.beginPath();g.moveTo(-14,2);g.lineTo(-25,5);g.stroke();
      g.beginPath();g.moveTo(-6,0);g.quadraticCurveTo(-4,-14*fl-4,-16,-22*fl);g.lineTo(6,0);g.fill();g.restore();
    }
    g.globalAlpha=1;
  }
  function frame(now){
    if(!alive)return;const raw=(now-last)/1000||0,dt=Math.min(.05,raw);last=now;
    if(vid&&vid.paused){const p=vid.play();if(p&&p.catch)p.catch(()=>{})}
    const P=params(dt);step(dt,P);draw(P);raf=requestAnimationFrame(frame);
  }
  const offSub=ctx.subscribe?ctx.subscribe(s=>{if(s.timeOfDay in HOURS)tod=s.timeOfDay;if(ctx.reducedMotion)still()}):null;
  // while the host freezes the frame loop (desktop covered), stop decoding the video too
  const watch=setInterval(()=>{if(vid&&!vid.paused&&performance.now()-last>700)vid.pause()},500);
  function still(){if(!imgs.pic)return;T=12;draw(params())}
  Promise.all([loadImage(pictureUrl),loadImage(waterUrl),loadImage(skyUrl)]).then(a=>{
    if(!alive)return;imgs={pic:a[0],water:a[1],sky:a[2]};
    const c=document.createElement('canvas');c.width=960;c.height=540;const x=c.getContext('2d');x.drawImage(a[1],0,0);waterData=x.getImageData(0,0,960,540).data;
    fit();
    if(ctx.reducedMotion)still();
    else{for(let i=0;i<400;i++)step(.05,params());draw(params());last=performance.now();raf=requestAnimationFrame(frame);startVideo()}
    requestAnimationFrame(()=>requestAnimationFrame(()=>ctx.ready()));
  });
  return {
    unmount(){
      alive=false;cancelAnimationFrame(raf);clearInterval(watch);ro.disconnect();if(offPtr)offPtr();if(offSub)offSub();
      if(vid){vid.pause();vid.removeAttribute('src');vid.load();vid=null}
      if(vidUrl)URL.revokeObjectURL(vidUrl);
      container.replaceChildren();
    },
  };
}
